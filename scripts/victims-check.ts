// Prints the real repeat-victimisation distribution and the top clusters, so
// the headline ratio can be checked against the register without the UI.
//   npm run victims
//   npm run victims -- --district 7 --min 3 --top 15
import "dotenv/config";
import { prisma, scopedClient } from "../lib/db";
import { findRepeatVictims } from "../lib/victims";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] ?? null : null;
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

async function main() {
  const districtId = Number(arg("district")) || null;
  const minCases = Number(arg("min")) || 2;
  const top = Number(arg("top")) || 20;

  const t0 = Date.now();
  const r = await findRepeatVictims(scopedClient(districtId), { minCases, limit: 500 });
  const d = r.distribution;

  console.log(
    `scope: ${districtId ? `district ${districtId}` : "statewide"} · ` +
      `${((Date.now() - t0) / 1000).toFixed(1)}s${r.truncated ? " (corpus cap hit)" : ""}`
  );
  console.log(`${d.victimRecords} victim rows across ${d.cases} cases -> ${d.people} people after clustering`);
  console.log(
    `THE FINDING: ${d.repeatPeople} people (${pct(d.repeatShare)} of victims) account for ` +
      `${d.repeatCases} cases (${pct(d.repeatCaseShare)} of all cases with a named victim)`
  );
  console.log(`most victimised single person: ${d.maxCases} cases`);

  // How much of the list is a confident identification and how much is a name
  // the register cannot separate — the caveat, in numbers.
  const capped = r.clusters.filter((c) => c.capped).length;
  console.log(
    `\n${r.clusters.length} clusters at minCases=${minCases}; ` +
      `${capped} held at a capped confidence (${r.clusters.filter((c) => c.capped === "common-name").length} common-name)`
  );

  console.log("\ntop clusters:");
  for (const c of r.clusters.slice(0, top)) {
    console.log(
      `  ${c.person.name.padEnd(24)} ${String(c.person.age ?? "--").padStart(3)} ${(c.person.gender ?? "-").padEnd(7)} ` +
        `${c.caseCount} cases · ${c.first} → ${c.last} (${c.spanDays}d) · conf ${c.confidence.toFixed(2)}` +
        `${c.capped ? ` [${c.capped}]` : ""}`
    );
    console.log(`      ${c.districts.join(", ")} · ${c.crimeTypes.join(", ")}`);
    console.log(`      why: ${c.reasons.map((x) => x.label).join(" | ")}`);
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
