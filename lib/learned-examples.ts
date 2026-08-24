import { prisma } from "./db";
import { embedText, embeddingAvailable } from "./embeddings";

/**
 * Examples the system learned from being corrected.
 *
 * The seeded few-shot bank lives in lib/rag-examples.json, which is read-only
 * once the app is packaged for AppSail — so a correction accepted in review is
 * stored in the database instead and merged into retrieval at query time. An
 * approved correction changes the next answer without a redeploy.
 *
 * Nothing reaches this table without a reviewer: the SQL has already passed the
 * SELECT-only validator and been executed once against the real schema. A
 * few-shot example is model input, so an unreviewed one would be a way to teach
 * the pipeline a mistake.
 */

export type LearnedExample = { id: string; question: string; sql: string; embedding: number[] | null };
export type ScoredExample = { question: string; sql: string; score: number };

/**
 * The SQL half of a learned example is validated and executed before it is
 * stored. The QUESTION half was not checked at all - and it is interpolated
 * verbatim into the text-to-SQL prompt, as `-- Q: <question>`, ahead of the
 * officer's real question. Anyone who can leave feedback could therefore write
 * prompt text that every officer's next query is generated under, with no
 * redeploy. A few-shot question is one line of natural language; anything that
 * looks like a second SQL statement, a comment escape, or an instruction to the
 * model is not one.
 */
const MAX_QUESTION_CHARS = 200;

const INSTRUCTION_SHAPES: RegExp[] = [
  /\b(?:ignore|disregard|forget|override)\b[^.]*\b(?:previous|prior|above|earlier|all)\b/i,
  /\b(?:instruction|prompt|system|rule)s?\b\s*[:\-]/i,
  /\byou\s+(?:are|must|should|will|shall|need\s+to)\b/i,
  /\b(?:act|behave|respond)\s+as\b/i,
  /\b(?:always|never)\s+(?:return|answer|reply|output|include|omit|use|add|drop|write)\b/i,
  /\bpretend\b/i,
  /\bsystem\s+prompt\b/i,
];

/**
 * Returns the question if it is safe to use as prompt text, or the reason it is
 * not. Never rewrites: a reviewer who wrote something the checker rejects
 * should see the rejection, not a silently edited example.
 */
export function checkLearnedQuestion(raw: unknown): { ok: true; question: string } | { ok: false; error: string } {
  const question = typeof raw === "string" ? raw.trim() : "";
  if (!question) return { ok: false, error: "The feedback has no question to learn from" };
  if (/[\r\n\u2028\u2029]/.test(question)) {
    return { ok: false, error: "A learned question must be a single line" };
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return { ok: false, error: `A learned question must be at most ${MAX_QUESTION_CHARS} characters` };
  }
  if (question.includes("--") || question.includes(";") || question.includes("/*") || question.includes("*/")) {
    return { ok: false, error: "A learned question must not contain SQL comment or statement punctuation" };
  }
  if (INSTRUCTION_SHAPES.some((re) => re.test(question))) {
    return { ok: false, error: "A learned question must be a question about the data, not an instruction to the model" };
  }
  return { ok: true, question };
}

const CACHE_TTL_MS = 60_000;
let cache: { at: number; rows: LearnedExample[] } | null = null;

export function invalidateLearnedExamples() {
  cache = null;
}

export async function getLearnedExamples(): Promise<LearnedExample[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const rows = await prisma.learnedExample.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, question: true, sql: true, embedding: true },
  });
  // Checked on the way out as well as on the way in: a row stored before the
  // question was validated is still prompt text every officer's next query
  // would be generated under.
  const parsed: LearnedExample[] = rows
    .filter((r) => checkLearnedQuestion(r.question).ok)
    .map((r) => ({
      id: r.id,
      question: r.question,
      sql: r.sql,
      embedding: Array.isArray(r.embedding) ? (r.embedding as number[]) : null,
    }));
  cache = { at: Date.now(), rows: parsed };
  return parsed;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/\W+/).filter((t) => t.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((t) => b.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}

/**
 * Scores the learned bank against a question. Uses the same cosine the seeded
 * bank is scored with when embeddings are available, so the two are directly
 * comparable; falls back to word overlap when they are not.
 */
export async function scoreLearned(question: string, topK = 3): Promise<{ scored: ScoredExample[]; comparable: boolean }> {
  const learned = await getLearnedExamples();
  if (!learned.length) return { scored: [], comparable: true };

  const withVectors = learned.filter((l) => l.embedding?.length);
  if (embeddingAvailable() && withVectors.length) {
    try {
      const q = await embedText(question);
      const scored = withVectors
        .map((l) => ({ question: l.question, sql: l.sql, score: cosine(q, l.embedding!) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
      return { scored, comparable: true };
    } catch {
      /* embedding call failed — fall through to overlap scoring */
    }
  }

  const qt = tokens(question);
  const scored = learned
    .map((l) => ({ question: l.question, sql: l.sql, score: jaccard(qt, tokens(l.question)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return { scored, comparable: false };
}

/** Stores an approved correction, embedding it now so lookups stay cheap. */
export async function addLearnedExample(input: {
  question: string;
  sql: string;
  feedbackId?: string | null;
  source?: string;
}): Promise<{ id: string; embedded: boolean }> {
  const checked = checkLearnedQuestion(input.question);
  if (!checked.ok) throw new Error(checked.error);

  let embedding: number[] | null = null;
  if (embeddingAvailable()) {
    try {
      embedding = await embedText(input.question);
    } catch (e) {
      // Worth storing anyway: word-overlap scoring still finds it, and the
      // vector can be filled in later.
      console.warn("learned example stored without an embedding:", (e as Error).message);
    }
  }

  const row = await prisma.learnedExample.create({
    data: {
      question: input.question,
      sql: input.sql,
      feedbackId: input.feedbackId ?? null,
      source: input.source ?? "feedback",
      embedding: embedding ?? undefined,
    },
    select: { id: true },
  });
  invalidateLearnedExamples();
  return { id: row.id, embedded: Boolean(embedding) };
}

export async function deactivateLearnedExample(id: string): Promise<void> {
  await prisma.learnedExample.update({ where: { id }, data: { active: false } });
  invalidateLearnedExamples();
}

export function countLearnedExamples(): Promise<number> {
  return prisma.learnedExample.count({ where: { active: true } });
}
