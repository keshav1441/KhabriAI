import { readFileSync } from "fs";
import { join } from "path";

type Example = { question: string; sql: string };
type EmbeddedExample = { example: Example; embedding: number[] };

// ponytail: module-level singletons survive across requests in prod, reset on hot-reload in dev
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractor: any = null;
let cachedEmbeddings: EmbeddedExample[] | null = null;

async function getExtractor() {
  if (!extractor) {
    const { pipeline } = await import("@huggingface/transformers");
    extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return extractor;
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

export async function embed(text: string): Promise<number[]> {
  const ext = await getExtractor();
  const output = await ext(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

async function getExampleEmbeddings(): Promise<EmbeddedExample[]> {
  if (cachedEmbeddings) return cachedEmbeddings;
  const examples: Example[] = JSON.parse(
    readFileSync(join(process.cwd(), "lib/rag-examples.json"), "utf-8")
  );
  cachedEmbeddings = await Promise.all(
    examples.map(async (example) => ({
      example,
      embedding: await embed(example.question),
    }))
  );
  return cachedEmbeddings;
}

export async function findSimilar(
  question: string,
  topK = 3,
  excludeIndex?: number
): Promise<Array<Example & { score: number }>> {
  const [qEmb, exEmbs] = await Promise.all([
    embed(question),
    getExampleEmbeddings(),
  ]);
  return exEmbs
    .map(({ example, embedding }, i) => ({ example, score: cosine(qEmb, embedding), i }))
    .filter(({ i }) => i !== excludeIndex)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ example, score }) => ({ ...example, score }));
}
