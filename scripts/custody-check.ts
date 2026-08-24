// Prints the real custody distribution, to see the column without the UI.
//   npm run custody
//   npm run custody -- --filter csNoCustody --limit 10
import "dotenv/config";
import { prisma } from "../lib/db";
import { buildCustodyBoard, type CustodyFilter } from "../lib/custody";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] ?? null : null;
}

const FILTERS: CustodyFilter[] = ["all", "none", "csNoCustody", "stale"];

async function main() {
  const requested = arg("filter") ?? "all";
  const filter: CustodyFilter = (FILTERS as string[]).includes(requested) ? (requested as CustodyFilter) : "all";
  const limit = Number(arg("limit")) || 10;

  // Unscoped on purpose: this is the whole corpus, not one officer's district.
  const board = await buildCustodyBoard(prisma, { filter: "all", limit: 100000 });
  const { summary, typeResolution, rows } = board;

  console.log("\nArrestSurrenderTypeID —", typeResolution.reason);

  console.log("\nCustody position over every live case in the corpus");
  console.log(`  live cases (not Closed / False Case)   ${summary.liveCases}`);
  console.log(`  accused recorded                       ${summary.accusedTotal}`);
  console.log(`  accused ever brought in                ${summary.broughtInTotal}` +
    (summary.accusedTotal ? `  (${((summary.broughtInTotal / summary.accusedTotal) * 100).toFixed(1)}%)` : ""));
  console.log(`  cases with nobody brought in           ${summary.noneBroughtIn}` +
    (summary.liveCases ? `  (${((summary.noneBroughtIn / summary.liveCases) * 100).toFixed(1)}%)` : ""));
  console.log(`  charge-sheeted, nobody brought in      ${summary.csNoCustody}`);
  console.log(`  stale (no action, clock running down)  ${summary.stale}`);

  // Counted off the rows, as a cross-check that the SQL summary and the pure
  // derivation agree — they are two separate implementations of one rule.
  const fromRows = {
    none: rows.filter((r) => r.custody.broughtIn === 0).length,
    csNoCustody: rows.filter((r) => r.custody.flags.includes("csNoCustody")).length,
    stale: rows.filter((r) => r.custody.flags.includes("stale")).length,
    noAccused: rows.filter((r) => r.custody.accusedCount === 0).length,
    partial: rows.filter((r) => r.custody.coverage !== null && r.custody.coverage > 0 && r.custody.coverage < 1).length,
    full: rows.filter((r) => r.custody.coverage === 1).length,
  };
  console.log("\nCross-check, counted over the rows themselves");
  console.log(`  rows                                   ${rows.length}`);
  console.log(`  nobody brought in                      ${fromRows.none}`);
  console.log(`  some but not all brought in            ${fromRows.partial}`);
  console.log(`  everyone brought in                    ${fromRows.full}`);
  console.log(`  no accused recorded at all             ${fromRows.noAccused}`);
  console.log(`  csNoCustody / stale                    ${fromRows.csNoCustody} / ${fromRows.stale}`);

  const sample = rows.filter((r) => (filter === "all" ? true : filter === "none" ? r.custody.broughtIn === 0 : r.custody.flags.includes(filter))).slice(0, limit);
  console.log(`\nSample (filter=${filter}, ${limit})`);
  for (const r of sample) {
    const c = r.custody;
    console.log(
      `  #${r.caseId} ${r.crimeNo ?? "-"} ${r.station.padEnd(22).slice(0, 22)} ${r.status.padEnd(18).slice(0, 18)} ` +
      `${c.broughtIn}/${c.accusedCount} brought in  last=${c.lastActionDate ?? "never"}  ` +
      `clock=${r.clock.daysRemaining}d  ${c.flags.join(",") || "-"}`
    );
  }
  console.log();
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect?.());
