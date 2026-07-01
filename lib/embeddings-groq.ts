import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { getGroqClient } from "./groq-client";

const EMBED_MODEL = process.env.GROQ_EMBED_MODEL ?? "nomic-embed-text-v1.5";
const CACHE_PATH = join(process.cwd(), "lib/rag-embeddings-cache.json");

type Example = { question: string; sql: string };
type CachedExample = { question: string; sql: string; embedding: number[] };

let exampleVectors: CachedExample[] | null = null;

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

async function embedTexts(texts: string[]): Promise<number[][]> {
  const groq = getGroqClient();
  const res = await groq.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
    encoding_format: "float",
  });
  return res.data.map((d) => {
    if (!Array.isArray(d.embedding)) throw new Error("Unexpected embedding format");
    return d.embedding;
  });
}

async function embedText(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  return vec;
}

function loadCache(): CachedExample[] | null {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as CachedExample[];
  } catch {
    return null;
  }
}

function saveCache(data: CachedExample[]) {
  writeFileSync(CACHE_PATH, JSON.stringify(data));
}

async function getExampleVectors(): Promise<CachedExample[]> {
  if (exampleVectors) return exampleVectors;

  const examples = loadExamples();
  const cached = loadCache();
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
  saveCache(exampleVectors);
  return exampleVectors;
}

let warmupPromise: Promise<void> | null = null;

export function warmupEmbeddings(): Promise<void> {
  if (!warmupPromise) {
    warmupPromise = getExampleVectors().then(() => undefined);
  }
  return warmupPromise;
}

export async function findSimilarEmbeddings(
  question: string,
  topK = 3,
  excludeIndex?: number
): Promise<Array<Example & { score: number }>> {
  const examples = loadExamples();
  const [qEmb, vectors] = await Promise.all([embedText(question), getExampleVectors()]);
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
