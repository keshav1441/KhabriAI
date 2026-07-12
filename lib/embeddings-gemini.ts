import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { cacheGet, cacheSet } from "./catalyst-cache";

// Groq has no embeddings endpoint on this account (verified: groq.models.list()
// returns zero embedding models) — Gemini is the real embedding backend.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBED_MODEL = "gemini-embedding-2";
export const EMBED_DIM = 768;
const BATCH_SIZE = 100;

const CACHE_PATH = join(process.cwd(), "lib/rag-embeddings-cache.json");
const CATALYST_CACHE_KEY = "rag:embeddings:v3";
const CATALYST_CACHE_TTL_MINUTES = 10080; // 7 days — examples change rarely

type Example = { question: string; sql: string };
type CachedExample = { question: string; sql: string; embedding: number[] };

let exampleVectors: CachedExample[] | null = null;

export function embeddingAvailable(): boolean {
  return Boolean(GEMINI_API_KEY);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function loadExamples(): Example[] {
  return JSON.parse(readFileSync(join(process.cwd(), "lib/rag-examples.json"), "utf-8"));
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const chunk = texts.slice(i, i + BATCH_SIZE);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: chunk.map((text) => ({
            model: `models/${EMBED_MODEL}`,
            content: { parts: [{ text }] },
            outputDimensionality: EMBED_DIM,
          })),
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini embed batch failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { embeddings: { values: number[] }[] };
    out.push(...data.embeddings.map((e) => e.values));
  }

  return out;
}

export async function embedText(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  return vec;
}

function loadLocalFileCache(): CachedExample[] | null {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as CachedExample[];
  } catch {
    return null;
  }
}

function saveLocalFileCache(data: CachedExample[]) {
  writeFileSync(CACHE_PATH, JSON.stringify(data));
}

// Catalyst Cache is the primary store; the local file is a secondary
// fallback so lookups keep working even when Catalyst is unreachable
// (e.g. local dev, which runs outside the AppSail proxy entirely).
async function loadCache(req?: Request): Promise<CachedExample[] | null> {
  const remote = await cacheGet(CATALYST_CACHE_KEY, req);
  if (remote) {
    try {
      return JSON.parse(remote) as CachedExample[];
    } catch {
      /* fall through to local file */
    }
  }
  return loadLocalFileCache();
}

async function saveCache(data: CachedExample[], req?: Request): Promise<void> {
  saveLocalFileCache(data);
  await cacheSet(CATALYST_CACHE_KEY, JSON.stringify(data), CATALYST_CACHE_TTL_MINUTES, req);
}

async function getExampleVectors(req?: Request): Promise<CachedExample[]> {
  if (exampleVectors) return exampleVectors;

  const examples = loadExamples();
  const cached = await loadCache(req);
  if (cached?.length === examples.length) {
    exampleVectors = cached;
    return exampleVectors;
  }

  const embeddings = await embedTexts(examples.map((e) => e.question));
  exampleVectors = examples.map((ex, i) => ({
    question: ex.question,
    sql: ex.sql,
    embedding: embeddings[i],
  }));
  await saveCache(exampleVectors, req);
  return exampleVectors;
}

let warmupPromise: Promise<void> | null = null;

export function warmupEmbeddings(req?: Request): Promise<void> {
  if (!warmupPromise) {
    warmupPromise = getExampleVectors(req).then(() => undefined);
  }
  return warmupPromise;
}

export async function findSimilarEmbeddings(
  question: string,
  topK = 3,
  excludeIndex?: number,
  req?: Request
): Promise<Array<Example & { score: number }>> {
  const examples = loadExamples();
  const [qEmb, vectors] = await Promise.all([embedText(question), getExampleVectors(req)]);
  const byQuestion = new Map(vectors.map((v) => [v.question, v.embedding]));

  return examples
    .map((example, i) => ({
      ...example,
      score: cosine(qEmb, byQuestion.get(example.question) ?? []),
      i,
    }))
    .filter(({ i }) => i !== excludeIndex)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
