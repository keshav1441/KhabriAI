// Moves the whole synthetic corpus forward in time so the newest FIR is
// yesterday and relative questions ("last 30 days", "this month") have data.
//   npx tsx scripts/shift-dates.ts            # dry run: prints the plan
//   npx tsx scripts/shift-dates.ts --apply    # do it
//   npx tsx scripts/shift-dates.ts --days=N   # explicit shift instead of "newest = yesterday"
//
// Shifts: CaseMaster (CrimeRegisteredDate, IncidentFromDate, IncidentToDate,
// InfoReceivedPSDate), ArrestSurrender.ArrestSurrenderDate, ChargesheetDetails.csdate,
// the dates written inside enriched BriefFacts narratives, and the year inside
// CrimeNo / CaseNo for rows whose registration year changed. Then recomputes the
// cached insights. Run AFTER scripts/enrich-briefs.ts has finished.
import "dotenv/config";
import { prisma } from "../lib/db";
import { shiftDatesInText } from "../lib/date-shift";
import { computeInsights } from "../lib/insights-compute";
import { setCachedInsights } from "../lib/insights-cache";

const apply = process.argv.includes("--apply");
const daysArg = process.argv.find((a) => a.startsWith("--days="));

async function main() {
  const [{ max }] = await prisma.$queryRawUnsafe<{ max: Date }[]>(`SELECT MAX("CrimeRegisteredDate") AS max FROM "CaseMaster"`);
  const yesterday = new Date(); yesterday.setUTCHours(0, 0, 0, 0); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const days = daysArg ? Number(daysArg.split("=")[1]) : Math.round((yesterday.getTime() - new Date(max).getTime()) / 86_400_000);
  const [{ templated, enriched }] = await prisma.$queryRawUnsafe<{ templated: number; enriched: number }[]>(
    `SELECT COUNT(*) FILTER (WHERE "BriefFacts" ILIKE '%reported at station%')::int templated, COUNT(*) FILTER (WHERE "BriefFacts" NOT ILIKE '%reported at station%')::int enriched FROM "CaseMaster"`
  );
  console.log(`newest FIR: ${new Date(max).toISOString().slice(0, 10)} -> shift by ${days} day(s); narratives: ${enriched} enriched, ${templated} still templated`);
  if (days <= 0) { console.log("nothing to do"); return; }
  if (templated > 0) console.warn(`warning: ${templated} briefs are still templated - their future narratives will be generated from the shifted dates, which is fine; but finish enrichment first if you want one consistent corpus.`);
  if (!apply) { console.log("dry run - pass --apply to execute"); return; }

  await prisma.$transaction(async (tx) => {
    const iv = `INTERVAL '${days} days'`;
    console.log("CaseMaster dates", await tx.$executeRawUnsafe(
      `UPDATE "CaseMaster" SET "CrimeRegisteredDate" = "CrimeRegisteredDate" + ${iv}, "IncidentFromDate" = "IncidentFromDate" + ${iv}, "IncidentToDate" = "IncidentToDate" + ${iv}, "InfoReceivedPSDate" = "InfoReceivedPSDate" + ${iv}`));
    console.log("ArrestSurrender", await tx.$executeRawUnsafe(`UPDATE "ArrestSurrender" SET "ArrestSurrenderDate" = "ArrestSurrenderDate" + ${iv}`));
    console.log("ChargesheetDetails", await tx.$executeRawUnsafe(`UPDATE "ChargesheetDetails" SET "csdate" = "csdate" + ${iv}`));
    // CrimeNo = '1' + district(4) + unit(4) + YYYY + serial(5); CaseNo = YYYY + serial(5)
    console.log("CrimeNo/CaseNo year", await tx.$executeRawUnsafe(
      `UPDATE "CaseMaster" SET "CrimeNo" = overlay("CrimeNo" placing to_char("CrimeRegisteredDate", 'YYYY') from 10 for 4),
                               "CaseNo" = to_char("CrimeRegisteredDate", 'YYYY') || substr("CaseNo", 5)
       WHERE length("CrimeNo") = 18 AND substr("CrimeNo", 10, 4) <> to_char("CrimeRegisteredDate", 'YYYY')`));
  }, { timeout: 120_000 });

  // Narrative text: done in JS because the formats vary; batched updates.
  const rows = await prisma.$queryRawUnsafe<{ id: number; b: string }[]>(`SELECT "CaseMasterID" id, "BriefFacts" b FROM "CaseMaster" WHERE "BriefFacts" NOT ILIKE '%reported at station%'`);
  let changed = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ id: r.id, b: shiftDatesInText(r.b, days) })).filter((r, j) => r.b !== rows[i + j].b);
    if (!chunk.length) continue;
    const values = chunk.map((r) => `(${r.id}, ${literal(r.b)})`).join(",");
    await prisma.$executeRawUnsafe(`UPDATE "CaseMaster" cm SET "BriefFacts" = v.b FROM (VALUES ${values}) AS v(id, b) WHERE cm."CaseMasterID" = v.id`);
    changed += chunk.length;
    process.stdout.write(`\r  narratives updated: ${changed}`);
  }
  console.log(`\nnarratives with dates shifted: ${changed}/${rows.length}`);

  const insights = await computeInsights();
  await setCachedInsights(insights);
  console.log(`insights recomputed: ${insights.length}`);
}

function literal(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
