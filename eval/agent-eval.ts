// End-to-end agent evaluation: the whole orchestrator, not just the SQL layer.
//   npx tsx eval/agent-eval.ts [--limit=N] [--only=substring] [--lang=kn]
//
// Deliberately a script, never `npm test`: every question is a live planner
// call plus a live synthesis call against a real database. It costs money and
// minutes, so it is run on purpose.
//
// Per question it records:
//   tools     — which tools the planner actually chose (the routing decision)
//   ms        — wall-clock latency, the number an officer feels
//   errored   — the run threw, or the answer is one of the degraded fallbacks
//   grounded  — the groundedness verdict on the narrative it produced
// Nothing here asserts a single correct answer: for most of these questions
// there isn't one. It measures routing, latency and whether the figures in the
// answer came from the data.
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { GroundednessVerdict } from "../lib/groundedness";

type Question = {
  q: string;
  /** What the tool surface should reach for. Recorded, not enforced - the
   *  planner is allowed to be cleverer than the expectation. */
  expect: string;
  /** True when the honest answer is "I cannot tell you that". */
  unanswerable?: boolean;
};

const QUESTIONS: Question[] = [
  // SQL counts and lists
  { q: "How many FIRs are in the database?", expect: "queryDatabase" },
  { q: "Which district registered the most cases?", expect: "queryDatabase" },
  { q: "How many cases are still under investigation?", expect: "queryDatabase" },
  { q: "What share of cases ended in a chargesheet?", expect: "queryDatabase" },
  { q: "List the top 5 accused by number of cases.", expect: "queryDatabase" },
  { q: "How many arrests were made in Mysuru?", expect: "queryDatabase" },
  { q: "Break down cases by crime group.", expect: "queryDatabase" },
  { q: "How many female victims are recorded?", expect: "queryDatabase" },
  { q: "Which police station has the heaviest caseload?", expect: "queryDatabase" },
  { q: "How many cases were registered in the last 30 days?", expect: "queryDatabase" },
  { q: "Compare Bengaluru Urban and Mysuru on total cases.", expect: "queryDatabase" },

  // Modus-operandi linking
  { q: "Find cases with the same modus operandi as chain snatching by two men on a motorcycle.", expect: "findSimilarCases" },
  { q: "Has a burglary using a duplicate key happened elsewhere in the state?", expect: "findSimilarCases" },
  { q: "Show me cases similar to an ATM card swap fraud, but only in other districts.", expect: "findSimilarCases" },
  { q: "Are there precedents for a cheating case involving fake job offers?", expect: "searchRelatedCases|findSimilarCases" },

  // Crew / network
  { q: "Who is behind the recent series of house break-ins - map the crew.", expect: "buildCrewDossier" },
  { q: "Build a dossier on the gang around the most repeated accused.", expect: "buildCrewDossier" },
  { q: "Which accused appear in cases across more than one district?", expect: "getNetworkOrMapData|queryDatabase" },
  { q: "Show the accused linkage network.", expect: "getNetworkOrMapData" },

  // Insights and forecasting
  { q: "What is notable in the data right now?", expect: "checkInsights" },
  { q: "Any unusual spikes I should know about?", expect: "checkInsights" },
  { q: "Where should we patrol next month?", expect: "predictHotspots" },
  { q: "Which crime group is trending up in Kalaburagi?", expect: "predictHotspots" },
  { q: "Where should I place resources over the next 60 days?", expect: "predictHotspots" },
  { q: "How are cases distributed across districts geographically?", expect: "getNetworkOrMapData" },

  // Risk
  { q: "How likely is a property crime case in Mysuru with one victim, two accused, an arrest and 40 days elapsed to be charge-sheeted?", expect: "predictRisk" },

  // Ambiguity and the unanswerable
  { q: "Tell me about Ravi.", expect: "askClarification" },
  { q: "How many cases were filed in Mumbai?", expect: "queryDatabase|askClarification", unanswerable: true },
  { q: "What is the conviction rate in court for these cases?", expect: "queryDatabase", unanswerable: true },
  { q: "Which officer is most likely to solve the next murder?", expect: "askClarification|queryDatabase", unanswerable: true },
];

type Row = {
  question: string;
  expect: string;
  unanswerable: boolean;
  tools: string[];
  routed: boolean;
  ms: number;
  errored: boolean;
  answer: string;
  grounded: boolean | null;
  checked: number;
  unsupported: string[];
};

// The orchestrator never throws for a failed tool - it degrades to one of these
// sentences. Treat that as an error, otherwise the eval reports a clean run.
const DEGRADED = [
  "Something went wrong processing your request.",
  "Found results, but could not generate a narrative summary.",
  "No further information could be synthesized.",
];

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const limit = Number(arg("limit")) || Infinity;
const only = arg("only");
const lang = (arg("lang") as "en" | "kn") ?? "en";

async function run() {
  const { runAgent } = await import("../lib/agent/orchestrator");
  const { prisma } = await import("../lib/db");

  const picked = QUESTIONS.filter((x) => (only ? x.q.toLowerCase().includes(only.toLowerCase()) : true)).slice(0, limit);
  console.log(`\nAgent eval: ${picked.length} questions [lang=${lang}]\n`);

  const rows: Row[] = [];
  for (const item of picked) {
    const t0 = Date.now();
    const tools: string[] = [];
    let answer = "";
    let verdict: GroundednessVerdict | null = null;
    let errored = false;

    try {
      // No Request: the eval runs statewide (HQ scope), like a headquarters user.
      for await (const event of runAgent(item.q, [], undefined, lang)) {
        if (event.type === "step" && event.status !== "pending" && !tools.includes(event.tool)) tools.push(event.tool);
        if (event.type === "token") answer += event.token;
        if (event.type === "meta" && event.groundedness) verdict = event.groundedness;
      }
    } catch (e) {
      errored = true;
      answer = (e as Error).message;
    }
    if (DEGRADED.some((d) => answer.includes(d))) errored = true;

    const unsupported = (verdict?.claims ?? []).filter((c) => !c.supported).map((c) => c.text);
    rows.push({
      question: item.q,
      expect: item.expect,
      unanswerable: Boolean(item.unanswerable),
      tools,
      routed: item.expect.split("|").some((t) => tools.includes(t)),
      ms: Date.now() - t0,
      errored,
      answer,
      grounded: verdict ? verdict.grounded : null,
      checked: verdict?.checked ?? 0,
      unsupported,
    });

    process.stdout.write(errored ? "E" : verdict && !verdict.grounded ? "?" : ".");
  }

  console.log("\n");
  const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));
  console.log(`${pad("question", 46)} ${pad("tools", 34)} ${pad("ms", 7)} ${pad("route", 6)} ground`);
  console.log("-".repeat(104));
  for (const r of rows) {
    const ground = r.errored ? "ERR" : r.grounded === null ? "-" : r.grounded ? "ok" : `✗ ${r.unsupported.join(",")}`;
    console.log(`${pad(r.question, 46)} ${pad(r.tools.join(",") || "-", 34)} ${pad(String(r.ms), 7)} ${pad(r.routed ? "ok" : "miss", 6)} ${ground}`);
  }

  const n = rows.length || 1;
  const routed = rows.filter((r) => r.routed).length;
  const errors = rows.filter((r) => r.errored).length;
  const withFigures = rows.filter((r) => r.checked > 0);
  const ungrounded = withFigures.filter((r) => r.grounded === false);
  const pct = (x: number, of: number) => `${Math.round((x / (of || 1)) * 100)}%`;

  console.log(`\nrouted as expected: ${routed}/${n} (${pct(routed, n)})`);
  console.log(`errored:            ${errors}/${n}`);
  console.log(`answers with figures: ${withFigures.length}/${n}`);
  console.log(`ungrounded:         ${ungrounded.length}/${withFigures.length || 1} (${pct(ungrounded.length, withFigures.length)})  ← figures no tool returned`);
  console.log(`median latency:     ${median(rows.map((r) => r.ms))} ms`);
  console.log(`p90 latency:        ${percentile(rows.map((r) => r.ms), 0.9)} ms`);

  if (ungrounded.length) {
    console.log("\nUnverified figures:");
    for (const r of ungrounded) console.log(`  ✗ ${r.unsupported.join(", ")}  — ${r.question}`);
  }

  const outDir = join(process.cwd(), "eval/results");
  mkdirSync(outDir, { recursive: true });
  const name = `agent-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}${lang === "kn" ? "-kn" : ""}.json`;
  writeFileSync(
    join(outDir, name),
    JSON.stringify({ lang, total: rows.length, routed, errors, ungrounded: ungrounded.length, results: rows }, null, 2)
  );
  console.log(`\nsaved eval/results/${name}`);

  await prisma.$disconnect();
}

function median(xs: number[]): number {
  return percentile(xs, 0.5);
}

function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
