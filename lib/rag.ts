import { findSimilarEmbeddings, warmupEmbeddings as warmupGemini, embeddingAvailable } from "./embeddings-gemini";
import { findSimilarLlm } from "./rag-llm";

export type RagExample = { question: string; sql: string; score: number };

export async function findSimilar(
  question: string,
  topK = 3,
  excludeIndex?: number,
  req?: Request
): Promise<RagExample[]> {
  if (embeddingAvailable()) {
    try {
      return await findSimilarEmbeddings(question, topK, excludeIndex, req);
    } catch {
      /* fall through to LLM-based similarity */
    }
  }
  return findSimilarLlm(question, topK, excludeIndex);
}

export function warmupEmbeddings(req?: Request): Promise<void> {
  return embeddingAvailable() ? warmupGemini(req) : Promise.resolve();
}
