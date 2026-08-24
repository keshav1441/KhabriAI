import { prisma, runGuardedQuery } from "./db";
import { validateSQL, enforceLimit } from "./sql-validator";
import { addLearnedExample, checkLearnedQuestion, countLearnedExamples } from "./learned-examples";
import { MAX_ROWS, QUERY_TIMEOUT_MS } from "./text-to-sql";

/**
 * The correction loop.
 *
 * A thumbs-down on its own is a number nobody acts on. What makes it useful is
 * that it arrives with the question, the SQL that was generated and the tools
 * that ran — so a reviewer can see what the pipeline did, write the SQL it
 * should have produced, and have that pair become a few-shot example. The next
 * officer who asks something similar gets the corrected shape.
 *
 * The chat client sends the exchange rather than the server joining it back:
 * chat messages are persisted with database-generated ids, so the id the
 * browser holds is local to that tab. It is kept only to keep one officer's
 * repeated votes on the same answer as one row.
 */

const LIMITS = { question: 2000, answer: 4000, sql: 8000, comment: 2000 };

export type Vote = "up" | "down";

export interface FeedbackInput {
  userId: number;
  messageId?: string | null;
  sessionId?: string | null;
  vote: Vote;
  question: string;
  answer?: string | null;
  sql?: string | null;
  tools?: string[];
  comment?: string | null;
}

const clip = (s: string | null | undefined, max: number) => (s ? s.slice(0, max) : null);

export async function recordFeedback(input: FeedbackInput) {
  const data = {
    userId: input.userId,
    sessionId: input.sessionId ?? null,
    messageId: input.messageId ?? null,
    question: clip(input.question, LIMITS.question) ?? "",
    answer: clip(input.answer, LIMITS.answer),
    sql: clip(input.sql, LIMITS.sql),
    tools: (input.tools ?? []).filter((t) => typeof t === "string").slice(0, 12),
    vote: input.vote,
    comment: clip(input.comment, LIMITS.comment),
  };

  // Changing your mind should replace the verdict, not add a second one. A row
  // already acted on in review keeps its status.
  if (data.messageId) {
    return prisma.answerFeedback.upsert({
      where: { userId_messageId: { userId: data.userId, messageId: data.messageId } },
      create: data,
      update: { vote: data.vote, comment: data.comment, sql: data.sql, tools: data.tools },
    });
  }
  return prisma.answerFeedback.create({ data });
}

export async function listFeedback(opts: { status?: string; vote?: Vote; limit?: number } = {}) {
  const { status, vote, limit = 50 } = opts;
  return prisma.answerFeedback.findMany({
    where: { ...(status ? { status } : {}), ...(vote ? { vote } : {}) },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: Math.min(limit, 200),
    include: { user: { select: { firstName: true, lastName: true, email: true, role: true } } },
  });
}

export interface ReviewResult {
  ok: boolean;
  status?: string;
  learnedExampleId?: string;
  rowsReturned?: number;
  error?: string;
}

/**
 * Accept or dismiss one piece of feedback. Accepting means the corrected SQL
 * becomes model input, so it has to survive the same validator the model's own
 * SQL does and actually run against the schema — a few-shot example that does
 * not execute teaches the wrong shape to every question that retrieves it.
 */
export async function reviewFeedback(input: {
  id: string;
  action: "approve" | "reject";
  correctedSql?: string | null;
  reviewerId: number;
}): Promise<ReviewResult> {
  const row = await prisma.answerFeedback.findUnique({ where: { id: input.id } });
  if (!row) return { ok: false, error: "Feedback not found" };
  if (row.status !== "new") return { ok: false, error: `Already ${row.status}` };

  // Approving turns this row into model input for every officer. Signing off
  // your own submission is the whole review gone: whoever wrote it would decide
  // it was correct. Dismissing your own is harmless, so only approval is barred.
  if (input.action === "approve" && row.userId === input.reviewerId) {
    return { ok: false, error: "A reviewer cannot approve their own feedback" };
  }

  if (input.action === "reject") {
    await prisma.answerFeedback.update({
      where: { id: row.id },
      data: { status: "rejected", reviewedById: input.reviewerId, reviewedAt: new Date() },
    });
    return { ok: true, status: "rejected" };
  }

  const sql = (input.correctedSql ?? "").trim();
  if (!sql) return { ok: false, error: "Approving needs the SQL the answer should have used" };

  const check = validateSQL(sql);
  if (!check.valid) return { ok: false, error: `Rejected by the SQL validator: ${check.error}` };

  // The question is prompt text too - it is written into the SQL prompt as
  // `-- Q: <question>`, ahead of the officer's own - and until now it was the
  // one half of the pair nothing checked.
  const question = checkLearnedQuestion(row.question);
  if (!question.ok) return { ok: false, error: `Rejected by the question checker: ${question.error}` };

  let rowsReturned = 0;
  try {
    const rows = await runGuardedQuery(enforceLimit(sql, MAX_ROWS), { timeoutMs: QUERY_TIMEOUT_MS });
    rowsReturned = rows.length;
  } catch (e) {
    return { ok: false, error: `The corrected SQL did not run: ${(e as Error).message}` };
  }

  const learned = await addLearnedExample({
    question: question.question,
    sql,
    feedbackId: row.id,
    source: "feedback",
  });

  await prisma.answerFeedback.update({
    where: { id: row.id },
    data: {
      status: "approved",
      correctedSql: sql,
      reviewedById: input.reviewerId,
      reviewedAt: new Date(),
    },
  });

  return { ok: true, status: "approved", learnedExampleId: learned.id, rowsReturned };
}

export interface FeedbackStats {
  totals: { up: number; down: number; rated: number; satisfaction: number | null };
  pending: number;
  approved: number;
  rejected: number;
  learnedExamples: number;
  /** Daily buckets, oldest first, for the accuracy-over-time chart. */
  daily: { date: string; up: number; down: number; satisfaction: number | null; learned: number }[];
  /** Tools that appear most often on a thumbs-down — where the pipeline hurts. */
  weakSpots: { tool: string; down: number }[];
}

export async function feedbackStats(days = 30): Promise<FeedbackStats> {
  const [byVote, byStatus, learnedExamples, daily, learnedDaily, weak] = await Promise.all([
    prisma.answerFeedback.groupBy({ by: ["vote"], _count: { _all: true } }),
    prisma.answerFeedback.groupBy({ by: ["status"], _count: { _all: true } }),
    countLearnedExamples(),
    prisma.$queryRawUnsafe<{ d: string; up: number; down: number }[]>(
      `SELECT TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS d,
              COUNT(*) FILTER (WHERE "vote" = 'up')::int   AS up,
              COUNT(*) FILTER (WHERE "vote" = 'down')::int AS down
       FROM "AnswerFeedback"
       WHERE "createdAt" >= NOW() - ($1 || ' days')::interval
       GROUP BY 1 ORDER BY 1`,
      String(Math.floor(days))
    ),
    prisma.$queryRawUnsafe<{ d: string; n: number }[]>(
      `SELECT TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS d, COUNT(*)::int AS n
       FROM "LearnedExample"
       WHERE "createdAt" >= NOW() - ($1 || ' days')::interval
       GROUP BY 1 ORDER BY 1`,
      String(Math.floor(days))
    ),
    prisma.$queryRawUnsafe<{ tool: string; down: number }[]>(
      `SELECT UNNEST("tools") AS tool, COUNT(*)::int AS down
       FROM "AnswerFeedback"
       WHERE "vote" = 'down'
       GROUP BY 1 ORDER BY 2 DESC LIMIT 6`
    ),
  ]);

  const up = byVote.find((v) => v.vote === "up")?._count._all ?? 0;
  const down = byVote.find((v) => v.vote === "down")?._count._all ?? 0;
  const rated = up + down;
  const statusCount = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;

  const learnedByDay = new Map(learnedDaily.map((l) => [l.d, Number(l.n)]));
  let runningLearned = 0;

  return {
    totals: { up, down, rated, satisfaction: rated ? Math.round((up / rated) * 100) : null },
    pending: statusCount("new"),
    approved: statusCount("approved"),
    rejected: statusCount("rejected"),
    learnedExamples,
    daily: daily.map((d) => {
      const dayUp = Number(d.up);
      const dayDown = Number(d.down);
      const dayRated = dayUp + dayDown;
      // Cumulative, because the interesting line is "how much has it learned by
      // this date", not how many corrections happened to land that day.
      runningLearned += learnedByDay.get(d.d) ?? 0;
      return {
        date: d.d,
        up: dayUp,
        down: dayDown,
        satisfaction: dayRated ? Math.round((dayUp / dayRated) * 100) : null,
        learned: runningLearned,
      };
    }),
    weakSpots: weak.map((w) => ({ tool: w.tool, down: Number(w.down) })),
  };
}
