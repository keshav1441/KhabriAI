import { findSimilarEmbeddings, warmupEmbeddings as warmupGroq } from "./embeddings-groq";
import { findSimilarLlm } from "./rag-llm";

export type RagExample = { question: string; sql: string; score: number };

let useEmbeddings: boolean | null = null;

async function groqEmbeddingsAvailable(): Promise<boolean> {
  if (useEmbeddings !== null) return useEmbeddings;
  if (process.env.RAG_MODE === "llm") {
    useEmbeddings = false;
    return false;
  }
  if (process.env.RAG_MODE === "embed") {
    useEmbeddings = true;
    return true;
  }
  try {
    const { getGroqClient } = await import("./groq-client");
    await getGroqClient().embeddings.create({
      model: process.env.GROQ_EMBED_MODEL ?? "nomic-embed-text-v1.5",
      input: "ping",
    });
    useEmbeddings = true;
  } catch {
    useEmbeddings = false;
  }
  return useEmbeddings;
}

export async function findSimilar(
  question: string,
  topK = 3,
  excludeIndex?: number,
  req?: Request
): Promise<RagExample[]> {
  if (await groqEmbeddingsAvailable()) {
    return findSimilarEmbeddings(question, topK, excludeIndex, req);
  }
  return findSimilarLlm(question, topK, excludeIndex);
}

export function warmupEmbeddings(req?: Request): Promise<void> {
  return groqEmbeddingsAvailable().then((ok) => (ok ? warmupGroq(req) : Promise.resolve()));
}
