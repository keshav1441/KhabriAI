// Prints duplicate-filing candidates, to sanity-check the scoring without the UI.
//   npm run duplicates -- --case 13778
//   npm run duplicates -- --scan            (the corpus sweep the alert job runs)
import "dotenv/config";
import { prisma } from "../lib/db";
import { findDuplicatesOf, scanDuplicates, DUP } from "../lib/duplicate-detect";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] ?? null : null;
}
const has = (name: string) => process.argv.includes(`--${name}`);

const pct = (n: number) => `${String(Math.round(n * 100)).padStart(3)}%`;

async function main() {
  const caseId = Number(arg("case")) || null;
  if (!caseId && !has("scan")) {
    console.error("usage: npm run duplicates -- --case <id> | --scan");
    process.exit(1);
  }
  // Anything below the bar is still worth seeing by hand — the scoring's job is
  // to refuse to assert, not to hide the near misses from whoever is tuning it.
  const minLikelihood = Number(arg("min")) || (has("all") ? 0 : DUP.threshold);

  const t0 = Date.now();
  if (caseId) {
    const hits = await findDuplicatesOf(caseId, { minLikelihood });
    console.log(`case ${caseId} — ${hits.length} candidate(s) at >=${minLikelihood} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    for (const h of hits) {
      console.log(`  ${pct(h.likelihood)}  ${h.crimeNo ?? `#${h.id}`}  ${(h.station ?? "-").padEnd(22)} ${(h.district ?? "-").padEnd(18)} ${h.incident ?? "??????????"}${h.sameStation ? "  [same station]" : ""}`);
      for (const r of h.reasons) console.log(`         ${r.weight.toFixed(2)}  ${r.label}`);
    }
  } else {
    const hits = await scanDuplicates({ minLikelihood, maxPairs: Number(arg("limit")) || 20 });
    console.log(`${hits.length} pair(s) at >=${minLikelihood} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    for (const h of hits) {
      console.log(`  ${pct(h.likelihood)}  ${h.crimeNo ?? h.caseId} (${h.station ?? h.districtName}) ~ ${h.matchCrimeNo ?? h.matchId} (${h.matchStation ?? h.matchDistrictName})${h.sameStation ? "  [same station]" : ""}`);
      console.log(`         ${h.reasons.map((r) => r.label).join(" | ")}`);
    }
  }
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
