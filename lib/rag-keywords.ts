import { readFileSync } from "fs";
import { join } from "path";

type Example = { question: string; sql: string };

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/\W+/).filter((t) => t.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((t) => b.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

export async function findSimilarKeyword(
  question: string,
  topK = 3,
  excludeIndex?: number
): Promise<Array<Example & { score: number }>> {
  const examples: Example[] = JSON.parse(
    readFileSync(join(process.cwd(), "lib/rag-examples.json"), "utf-8")
  );
  const qTokens = tokenize(question);
  return examples
    .map((example, i) => ({
      ...example,
      score: jaccard(qTokens, tokenize(example.question)),
      i,
    }))
    .filter(({ i }) => i !== excludeIndex)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
