// Run with: npx tsx eval/run.ts [--holdout]
import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";

// ponytail: dynamic imports so env is set before Groq/Prisma clients initialize
import { validateSQL, sanitizeSQL } from "../lib/sql-validator";
import { findSimilar } from "../lib/embeddings";
import { DB_SCHEMA } from "../lib/prompt-builder";

type Example = { question: string; sql: string };
type Result = {
  question: string;
  generated_sql: string;
  passed: boolean;
  error?: string;
  scores?: number[];
  tokenOverlap?: number;
};

function jaccard(a: string, b: string): number {
  const tokA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tokB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  const intersection = [...tokA].filter((t) => tokB.has(t)).length;
  const union = new Set([...tokA, ...tokB]).size;
  return union === 0 ? 0 : intersection / union;
}

const holdout = process.argv.includes("--holdout");

async function run() {
  const { generateSQL } = await import("../lib/llm");
  const { prisma } = await import("../lib/db");

  const examples: Example[] = JSON.parse(
    readFileSync(join(process.cwd(), "lib/rag-examples.json"), "utf-8")
  );

  console.log(`\nRunning eval on ${examples.length} questions${holdout ? " [holdout mode]" : ""}...\n`);
  const results: Result[] = [];

  for (let idx = 0; idx < examples.length; idx++) {
    const { question, sql: groundTruth } = examples[idx];
    try {
      const similar = await findSimilar(question, 3, holdout ? idx : undefined);
      const scores = similar.map((e) => e.score);
      const fewShot = similar.map((e) => `-- Q: ${e.question}\n${e.sql}`).join("\n\n");
      const raw = await generateSQL(DB_SCHEMA, fewShot, question, []);
      const sql = sanitizeSQL(raw);
      const validation = validateSQL(sql);
      const tokenOverlap = jaccard(sql, groundTruth);

      if (!validation.valid) {
        results.push({ question, generated_sql: sql, passed: false, error: validation.error, scores, tokenOverlap });
        process.stdout.write("F");
        continue;
      }

      await prisma.$queryRawUnsafe(sql);
      results.push({ question, generated_sql: sql, passed: true, scores, tokenOverlap });
      process.stdout.write(".");
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      results.push({ question, generated_sql: "", passed: false, error, scores: [], tokenOverlap: 0 });
      process.stdout.write("E");
    }
  }

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n\nResults: ${passed}/${results.length} passed (${Math.round((passed / results.length) * 100)}%)`);

  if (holdout) {
    const withScores = results.filter((r) => r.scores?.length);
    const avgSim = withScores.reduce((s, r) => s + (r.scores![0] ?? 0), 0) / withScores.length;
    const avgOverlap = results.reduce((s, r) => s + (r.tokenOverlap ?? 0), 0) / results.length;
    console.log(`Avg top-1 retrieval similarity: ${avgSim.toFixed(3)}`);
    console.log(`Avg SQL token overlap vs ground truth: ${(avgOverlap * 100).toFixed(1)}%`);
    console.log("\nPer-question breakdown:");
    for (const r of results) {
      const sim = r.scores?.map((s) => s.toFixed(2)).join(", ") ?? "-";
      const overlap = r.tokenOverlap != null ? `${(r.tokenOverlap * 100).toFixed(0)}%` : "-";
      const status = r.passed ? "✓" : "✗";
      console.log(`  ${status} [sim: ${sim}] [overlap: ${overlap}] ${r.question.slice(0, 60)}`);
    }
  }

  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const f of failed) {
      console.log(`  ✗ ${f.question}`);
      console.log(`    Error: ${f.error}`);
    }
  }

  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
