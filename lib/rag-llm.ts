import { readFileSync } from "fs";
import { join } from "path";
import { getGroqClient } from "./groq-client";

type Example = { question: string; sql: string };

const SELECT_MODEL = process.env.GROQ_RAG_MODEL ?? "llama-3.1-8b-instant";

function loadExamples(): Example[] {
  return JSON.parse(readFileSync(join(process.cwd(), "lib/rag-examples.json"), "utf-8"));
}

function parseIndices(raw: string, max: number): number[] {
  const match = raw.match(/\[[\d,\s]+\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]) as number[];
    return arr.filter((n) => Number.isInteger(n) && n >= 0 && n < max);
  } catch {
    return [];
  }
}

/** Fallback when Groq embeddings API is unavailable — 8B picks example indices */
export async function findSimilarLlm(
  question: string,
  topK = 3,
  excludeIndex?: number
): Promise<Array<Example & { score: number }>> {
  const examples = loadExamples();
  const numbered = examples
    .map((e, i) => `${i}: ${e.question}`)
    .join("\n");

  const groq = getGroqClient();
  const completion = await groq.chat.completions.create({
    model: SELECT_MODEL,
    temperature: 0,
    max_tokens: 32,
    messages: [
      {
        role: "system",
        content:
          "Return ONLY a JSON array of the best matching example indices (0-based integers), most relevant first. No other text.",
      },
      {
        role: "user",
        content: `Question: ${question}\n\nExamples:\n${numbered}\n\nTop ${topK} indices:`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "[]";
  let indices = parseIndices(raw, examples.length).filter((i) => i !== excludeIndex);

  if (indices.length === 0) {
    indices = examples.map((_, i) => i).filter((i) => i !== excludeIndex).slice(0, topK);
  }

  return indices.slice(0, topK).map((i, rank) => ({
    ...examples[i],
    score: 1 - rank * 0.01,
  }));
}
