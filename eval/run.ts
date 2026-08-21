// Text-to-SQL evaluation over lib/rag-examples.json.
//   npx tsx eval/run.ts [--holdout] [--no-repair] [--keywords] [--limit=N]
//
// Reports two numbers, deliberately separate:
//   executes  — generated SQL ran without error (what the old eval called "passed")
//   matches   — its result set equals the gold SQL's result set (Spider-style
//               execution match, value-only, order-insensitive). This is accuracy.
// --holdout excludes each question's own example from few-shot retrieval, so
// the score measures generalization rather than recall of the training set.
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { resultsMatch } from "./compare";

type Example = { question: string; sql: string; lang?: "en" | "kn" };
type Result = {
  question: string;
  lang: "en" | "kn";
  generated_sql: string;
  executes: boolean;
  matches: boolean;
  repaired: boolean;
  error?: string;
  topSim?: number;
  ms: number;
};

const flag = (f: string) => process.argv.includes(f);
const holdout = flag("--holdout");
const repair = !flag("--no-repair");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

async function run() {
  const { answerWithSQL } = await import("../lib/text-to-sql");
  const { prisma, runGuardedQuery } = await import("../lib/db");

  const all: Example[] = JSON.parse(readFileSync(join(process.cwd(), "lib/rag-examples.json"), "utf-8"));
  const examples = all.slice(0, limit);
  console.log(
    `\nEval: ${examples.length} questions` +
      `${holdout ? " [holdout]" : ""}${repair ? " [repair on]" : " [repair off]"}\n`
  );

  const results: Result[] = [];
  for (let idx = 0; idx < examples.length; idx++) {
    const { question, sql: gold, lang = "en" } = examples[idx];
    const t0 = Date.now();
    try {
      const goldRows = await runGuardedQuery(gold, { timeoutMs: 15000 });
      const out = await answerWithSQL(question, { repair, excludeIndex: holdout ? idx : undefined, fewShotK: 3 });
      const matches = resultsMatch(out.rows, goldRows);
      results.push({
        question, lang, generated_sql: out.sql, executes: true, matches, repaired: out.repaired,
        topSim: out.retrievalScores[0], ms: Date.now() - t0,
      });
      process.stdout.write(matches ? "." : "x");
    } catch (e) {
      const err = e as Error & { sql?: string };
      results.push({
        question, lang, generated_sql: err.sql ?? "", executes: false, matches: false, repaired: false,
        error: err.message, ms: Date.now() - t0,
      });
      process.stdout.write("E");
    }
  }

  const pct = (n: number) => `${Math.round((n / results.length) * 100)}%`;
  const executes = results.filter((r) => r.executes).length;
  const matches = results.filter((r) => r.matches).length;
  const repaired = results.filter((r) => r.repaired).length;
  const kn = results.filter((r) => r.lang === "kn");
  const knMatches = kn.filter((r) => r.matches).length;

  console.log(`\n\nexecutes: ${executes}/${results.length} (${pct(executes)})`);
  console.log(`matches:  ${matches}/${results.length} (${pct(matches)})  ← execution accuracy`);
  if (kn.length) console.log(`kannada:  ${knMatches}/${kn.length} match`);
  console.log(`repaired: ${repaired} queries recovered by the error-feedback retry`);
  console.log(`median latency: ${median(results.map((r) => r.ms))} ms`);

  const bad = results.filter((r) => !r.matches);
  if (bad.length) {
    console.log("\nNot matching:");
    for (const r of bad) {
      console.log(`  ✗ ${r.executes ? "wrong result" : "error"} ${r.question}`);
      if (r.error) console.log(`      ${r.error.slice(0, 160)}`);
    }
  }

  const outDir = join(process.cwd(), "eval/results");
  mkdirSync(outDir, { recursive: true });
  const name = `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}${holdout ? "-holdout" : ""}${repair ? "" : "-norepair"}.json`;
  writeFileSync(join(outDir, name), JSON.stringify({ holdout, repair, executes, matches, total: results.length, results }, null, 2));
  console.log(`\nsaved eval/results/${name}`);

  await prisma.$disconnect();
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
