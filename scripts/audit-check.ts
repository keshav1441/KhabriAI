// Runs one real agent question and reads the audit trail back the way the
// reviewer console does.
//   npm run audit -- "how many FIRs were filed in Mysuru last month?"
import "dotenv/config";
import { prisma } from "../lib/db";
import { runAgent } from "../lib/agent/orchestrator";
import { listAuditRuns, auditSummary } from "../lib/audit";

const question = process.argv.slice(2).filter((a) => !a.startsWith("--")).join(" ")
  || "How many FIRs were filed in Mysuru last month?";

async function main() {
  process.stdout.write(`asking: ${question}\n`);
  let tokens = 0;
  for await (const ev of runAgent(question, [])) {
    if (ev.type === "step" && ev.status !== "pending") process.stdout.write(`  tool ${ev.tool} -> ${ev.status}\n`);
    if (ev.type === "token") tokens++;
  }
  process.stdout.write(`  answer streamed in ${tokens} tokens\n`);

  // The audit writes are fire-and-forget, so give them a beat to land.
  await new Promise((r) => setTimeout(r, 1500));

  const runs = await listAuditRuns({ q: question.slice(0, 20), days: 1, limit: 3 });
  console.log(`\n${runs.length} matching run(s) in the trail:`);
  for (const r of runs) {
    console.log(`  ${r.createdAt.toISOString()}  ${r.officer ?? "unattributed"} [${r.role ?? "?"} · ${r.scope}]  ` +
      `${r.toolCallCount ?? r.steps.length} tools, ${r.durationMs ?? "?"}ms${r.failed ? "  FAILED" : ""}`);
    console.log(`    Q: ${r.question}`);
    for (const s of r.steps) {
      console.log(`      ${(s.tool ?? "?").padEnd(20)} ${s.status}  ${s.rowCount ?? "-"} rows  ${s.durationMs ?? "-"}ms`);
    }
    if (r.finalAnswer) console.log(`    A: ${r.finalAnswer.slice(0, 120)}…`);
  }

  const s = await auditSummary(30);
  console.log(`\nsummary (30d): ${s.runs} runs · ${s.toolCalls} tool calls · ${s.failures} failures · ` +
    `${s.officers} officers · median run ${s.medianRunMs ?? "-"}ms`);
  console.log("by tool:", s.byTool.map((t) => `${t.tool} ${t.calls}c/${t.failures}f/${t.medianMs ?? "-"}ms`).join(", "));
  console.log("scopes:", s.scopes.join(", "));

  await prisma.$disconnect();
  process.exit(runs.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
