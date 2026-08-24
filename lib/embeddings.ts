import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { cacheGet, cacheSet } from "./catalyst-cache";
import { getLlmClient } from "./mistral-client";

// Mistral is the embedding backend (same key as chat). mistral-embed returns a
// 1024-dim unit vector; the CaseMaster.BriefFactsEmbedding column is vector(1024).
// encoding_format must be "float": the OpenAI SDK defaults to base64 and
// Mistral answers with plain floats, which the SDK silently decodes to zeros.
const EMBED_MODEL = process.env.MISTRAL_EMBED_MODEL ?? "mistral-embed";
export const EMBED_DIM = 1024;
const BATCH_SIZE = 100;

const CACHE_PATH = join(process.cwd(), "lib/rag-embeddings-cache.json");
const CATALYST_CACHE_KEY = `rag:embeddings:v4:${EMBED_MODEL}:${EMBED_DIM}`;
const CATALYST_CACHE_TTL_MINUTES = 10080; // 7 days — examples change rarely

type Example = { question: string; sql: string };
type CachedExample = { question: string; sql: string; embedding: number[] };

let exampleVectors: CachedExample[] | null = null;

export function embeddingAvailable(): boolean {
  return Boolean(process.env.MISTRAL_API_KEY);
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
  if (!embeddingAvailable()) throw new Error("MISTRAL_API_KEY not configured");
  const llm = getLlmClient();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const res = await llm.embeddings.create({ model: EMBED_MODEL, input: texts.slice(i, i + BATCH_SIZE), encoding_format: "float" });
    for (const d of res.data) {
      if (d.embedding.length !== EMBED_DIM) throw new Error(`embedding dim ${d.embedding.length} != ${EMBED_DIM}; column type must match`);
      out.push(d.embedding);
    }
  }
  return out;
}

export async function embedText(text: string): Promise<number[]> {
  return (await embedTexts([text]))[0];
}

export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
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

// Cache is valid only if it covers exactly the current example questions at
// the current dimension — a changed example or provider forces a re-embed.
function cacheMatches(cached: CachedExample[] | null, examples: Example[]): cached is CachedExample[] {
  if (!cached || cached.length !== examples.length) return false;
  if (cached.some((c) => c.embedding?.length !== EMBED_DIM)) return false;
  const qs = new Set(cached.map((c) => c.question));
  return examples.every((e) => qs.has(e.question));
}

async function getExampleVectors(req?: Request): Promise<CachedExample[]> {
  if (exampleVectors) return exampleVectors;

  const examples = loadExamples();
  const cached = await loadCache(req);
  if (cacheMatches(cached, examples)) {
    exampleVectors = cached;
    return exampleVectors;
  }

  const embeddings = await embedTexts(examples.map((e) => e.question));
  exampleVectors = examples.map((ex, i) => ({ question: ex.question, sql: ex.sql, embedding: embeddings[i] }));
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
    .map((example, i) => ({ ...example, score: cosine(qEmb, byQuestion.get(example.question) ?? []), i }))
    .filter(({ i }) => i !== excludeIndex)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
