import { findSimilarEmbeddings, warmupEmbeddings as warmupExampleVectors, embeddingAvailable } from "./embeddings";
import { findSimilarLlm } from "./rag-llm";
import { scoreLearned } from "./learned-examples";

export type RagExample = { question: string; sql: string; score: number };

/** Word-overlap scores never beat the LLM picker's near-1.0 ranks, so a learned
 *  example only takes a slot when it is clearly on topic. */
const OVERLAP_FLOOR = 0.3;

async function findSeeded(
  question: string,
  topK: number,
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

export async function findSimilar(
  question: string,
  topK = 3,
  excludeIndex?: number,
  req?: Request
): Promise<RagExample[]> {
  // `excludeIndex` means the evaluation harness is running a holdout: it is
  // measuring the seeded bank against its own gold SQL, and examples the system
  // learned later would make that number flattering rather than true.
  if (excludeIndex !== undefined) return findSeeded(question, topK, excludeIndex, req);

  const [seeded, learned] = await Promise.all([
    findSeeded(question, topK, undefined, req),
    scoreLearned(question, topK).catch(() => ({ scored: [], comparable: true })),
  ]);
  return mergeExamples(seeded, learned.scored, learned.comparable, topK);
}

/**
 * Combines the seeded bank with what review has taught the system. Kept pure so
 * the merge rule can be tested without a database or an embeddings call.
 */
export function mergeExamples(
  seeded: RagExample[],
  learned: RagExample[],
  comparable: boolean,
  topK: number
): RagExample[] {
  if (!learned.length) return seeded;

  if (comparable) {
    // Both sides are cosine over the same embedding model, so one ranking.
    return [...seeded, ...learned]
      .sort((a, b) => b.score - a.score)
      .filter((e, i, all) => all.findIndex((o) => o.question === e.question) === i)
      .slice(0, topK);
  }

  // Different scales. Rather than pretend they compare, give the best learned
  // example one slot when it is plainly relevant and keep the rest seeded.
  const best = learned[0];
  if (best.score < OVERLAP_FLOOR) return seeded;
  return [best, ...seeded.filter((e) => e.question !== best.question)].slice(0, topK);
}

export function warmupEmbeddings(req?: Request): Promise<void> {
  return embeddingAvailable() ? warmupExampleVectors(req) : Promise.resolve();
}
