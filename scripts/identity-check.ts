// Scores identity resolution against the corpus's own PersonID, which the
// scorer never sees. This is the only way to say how much of the crew dossier,
// the repeat-offender alerts and the offender profile would still work on real
// KSP data, where PersonID does not exist.
//
//   npm run identity                       (200 seeds, as the register stands)
//   npm run identity -- --sample 500
//   npm run identity -- --perturb          (names and ages mangled the way two
//                                           clerks actually mangle them)
//   npm run identity -- --accused 1234     (one record's candidates, by hand)
import "dotenv/config";
import { prisma } from "../lib/db";
import { evaluateIdentity, findSamePerson, IDENT } from "../lib/identity-resolve";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] ?? null : null;
}
const has = (name: string) => process.argv.includes(`--${name}`);
const pct = (n: number) => `${String((n * 100).toFixed(1)).padStart(5)}%`;

async function one(accusedId: number, min: number) {
  const r = await findSamePerson({ accusedId }, { minConfidence: min });
  if (!r) return console.error(`no accused record ${accusedId}`);
  const s = r.seed;
  console.log(`seed  #${s.accusedId}  ${s.name} · ${s.age} · ${s.district ?? "-"} · FIR ${s.crimeNo ?? s.caseId} (${s.registered ?? "undated"})`);
  console.log(`${r.considered} row(s) shared a name token; ${r.candidates.length} scored >= ${min}\n`);
  for (const c of r.candidates) {
    const mark = c.personIdAgrees === true ? "✓" : c.personIdAgrees === false ? "✗" : "?";
    console.log(`  ${pct(c.confidence)} ${mark}  ${c.name} · ${c.age} · ${(c.district ?? "-").padEnd(18)} FIR ${c.crimeNo ?? c.caseId}${c.capped ? `  [capped: ${c.capped}]` : ""}`);
    for (const reason of c.reasons) console.log(`          ${reason.weight.toFixed(2)}  ${reason.label}`);
  }
  console.log("\n  ✓/✗ is the PersonID answer key, which the scorer never sees.");
}

async function main() {
  const accusedId = Number(arg("accused")) || null;
  const min = Number(arg("min")) || IDENT.threshold;
  if (accusedId) return one(accusedId, min);

  const sample = Number(arg("sample")) || 200;
  const perturb = has("perturb");
  const t0 = Date.now();
  const e = await evaluateIdentity({ sample, perturb, minConfidence: min });

  console.log(`\nIdentity resolution vs PersonID — ${e.sample} seeds${perturb ? ", register noise applied" : ""}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  threshold        ${min}`);
  console.log(`  pairs asserted   ${e.predicted}   (${e.truePositives} right, ${e.falsePositives} wrong)`);
  console.log(`  pairs missed     ${e.falseNegatives}`);
  console.log(`  precision        ${pct(e.precision)}`);
  console.log(`  recall           ${pct(e.recall)}`);
  console.log(`  F1               ${pct(e.f1)}`);
  console.log(`  baseline (same written name, nothing else): precision ${pct(e.namePrecision)}  recall ${pct(e.nameRecall)}`);

  console.log("\nexample clusters");
  for (const x of e.examples) {
    console.log(`  ${x.seed} (#${x.seedAccusedId}) — ${x.truePositives} right, ${x.falsePositives} wrong, ${x.missed} missed`);
    for (const c of x.topCandidates) {
      console.log(`      ${pct(c.confidence)} ${c.correct ? "✓" : "✗"}  ${c.name} · ${c.age}`);
    }
  }
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
