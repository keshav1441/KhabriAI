// Prints the crew dossier for a seed, to sanity-check the walk without the UI.
//   npm run crew -- --case 13778
//   npm run crew -- --person KSP-P-00928
import "dotenv/config";
import { prisma } from "../lib/db";
import { buildCrew } from "../lib/crew";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] ?? null : null;
}

async function main() {
  const caseId = Number(arg("case")) || null;
  const personId = arg("person");
  if (!caseId && !personId) {
    console.error("usage: npm run crew -- --case <id> | --person <PersonID>");
    process.exit(1);
  }

  const t0 = Date.now();
  const d = await buildCrew({ caseId, personId });
  console.log(`${d.seed.label} — ${((Date.now() - t0) / 1000).toFixed(1)}s${d.truncated ? " (capped)" : ""}`);
  console.log(`${d.summary.cases} cases · ${d.summary.members} members · ${d.summary.districts} districts · ` +
    `${d.summary.chargesheeted} chargesheeted, ${d.summary.open} open · ${d.summary.first} → ${d.summary.last}`);
  console.log(`districts: ${d.districts.join(", ")}`);
  console.log(`signature: ${d.signature.join(" | ") || "(none recurring)"}`);
  console.log("\nmembers:");
  for (const m of d.members.slice(0, 10)) {
    console.log(`  ${m.name.padEnd(20)} ${m.personId}  crew ${String(m.casesInCrew).padStart(2)} / ${m.totalCases} total · ${m.arrests} arrests · ${m.districts.join(", ")}`);
  }
  console.log("\ncases:");
  for (const c of d.cases) {
    const how = c.link === "mo" ? `mo ${(c.linkScore ?? 0).toFixed(2)} ← ${c.linkedFrom}` : c.link;
    console.log(`  ${c.date ?? "??????????"}  ${c.crimeNo}  ${(c.district ?? "-").padEnd(18)} ${(c.crimeType ?? "-").padEnd(26)} [${how}]${c.chargesheeted ? " CS" : ""}`);
  }
  const cross = d.moLinks.filter((l) => l.crossDistrict).length;
  console.log(`\n${d.moLinks.length} MO links, ${cross} crossing a district boundary`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
