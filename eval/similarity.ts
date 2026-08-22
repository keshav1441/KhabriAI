// Case-similarity (modus operandi linking) evaluation.
//   npx tsx eval/similarity.ts [--sample=300]
//
// For a random sample of embedded cases, take the 5 nearest neighbours by
// cosine distance (excluding the case itself) and report:
//   type@5    share of neighbours with the same specific crime type
//   group@5   share of neighbours in the same crime group
//   series@5  for cases in an MO series (same repeat offender, same crime
//             group, >= 2 cases), how often at least one neighbour belongs to
//             the same series - i.e. did the linker find the same crew from
//             the narrative alone (narratives never name the accused)
//   xdistrict share of series hits that are in a DIFFERENT district - the
//             cross-jurisdiction links a single station would never see
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/db";
import { similarCasesTo } from "../lib/case-retrieval";

const sampleArg = process.argv.find((a) => a.startsWith("--sample="));
const SAMPLE = sampleArg ? Number(sampleArg.split("=")[1]) : 300;
const K = 5;

type Row = { id: number; type: string; grp: string; district: string; series: string[] };

async function main() {
  const sample = await prisma.$queryRawUnsafe<Row[]>(
    `WITH series AS (
       SELECT a."PersonID", cm."CrimeMajorHeadID"
       FROM "Accused" a JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID"
       WHERE a."PersonID" IS NOT NULL GROUP BY 1, 2 HAVING COUNT(DISTINCT cm."CaseMasterID") >= 2
     )
     SELECT cm."CaseMasterID" AS id, csh."CrimeHeadName" AS type, ch."CrimeGroupName" AS grp, d."DistrictName" AS district,
            COALESCE((SELECT array_agg(a."PersonID" || '|' || cm."CrimeMajorHeadID") FROM "Accused" a JOIN series s ON s."PersonID" = a."PersonID" AND s."CrimeMajorHeadID" = cm."CrimeMajorHeadID" WHERE a."CaseMasterID" = cm."CaseMasterID"), '{}') AS series
     FROM "CaseMaster" cm
     JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
     JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
     JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID" JOIN "District" d ON d."DistrictID" = u."DistrictID"
     WHERE cm."BriefFactsEmbedding" IS NOT NULL
     ORDER BY random() LIMIT ${SAMPLE}`
  );
  if (!sample.length) { console.log("No embedded cases - run scripts/backfill-embeddings.ts first."); return; }

  const lookup = async (ids: number[]) => prisma.$queryRawUnsafe<Row[]>(
    `WITH series AS (
       SELECT a."PersonID", cm."CrimeMajorHeadID"
       FROM "Accused" a JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID"
       WHERE a."PersonID" IS NOT NULL GROUP BY 1, 2 HAVING COUNT(DISTINCT cm."CaseMasterID") >= 2
     )
     SELECT cm."CaseMasterID" AS id, csh."CrimeHeadName" AS type, ch."CrimeGroupName" AS grp, d."DistrictName" AS district,
            COALESCE((SELECT array_agg(a."PersonID" || '|' || cm."CrimeMajorHeadID") FROM "Accused" a JOIN series s ON s."PersonID" = a."PersonID" AND s."CrimeMajorHeadID" = cm."CrimeMajorHeadID" WHERE a."CaseMasterID" = cm."CaseMasterID"), '{}') AS series
     FROM "CaseMaster" cm
     JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
     JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
     JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID" JOIN "District" d ON d."DistrictID" = u."DistrictID"
     WHERE cm."CaseMasterID" IN (${ids.join(",")})`
  );

  let typeHits = 0, groupHits = 0, seriesCases = 0, seriesHit = 0, seriesCross = 0, total = 0;
  const t0 = Date.now();
  for (const c of sample) {
    const neighbours = await similarCasesTo(c.id, { topK: K });
    if (!neighbours.length) continue;
    const meta = await lookup(neighbours.map((n) => n.id));
    const byId = new Map(meta.map((m) => [m.id, m]));
    for (const n of neighbours) {
      const m = byId.get(n.id); if (!m) continue;
      total++;
      if (m.type === c.type) typeHits++;
      if (m.grp === c.grp) groupHits++;
    }
    if (c.series.length) {
      seriesCases++;
      const hit = meta.find((m) => m.series.some((s) => c.series.includes(s)));
      if (hit) { seriesHit++; if (hit.district !== c.district) seriesCross++; }
    }
  }
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "n/a");
  const summary = {
    sample: sample.length, k: K,
    typeAt5: pct(typeHits, total), groupAt5: pct(groupHits, total),
    seriesCases, seriesRecallAt5: pct(seriesHit, seriesCases), seriesCrossDistrict: pct(seriesCross, seriesHit),
    msPerQuery: Math.round((Date.now() - t0) / sample.length),
  };
  console.log(`\nsample:      ${summary.sample} cases, k=${K}`);
  console.log(`type@5:      ${summary.typeAt5}   (neighbours with the same specific crime type)`);
  console.log(`group@5:     ${summary.groupAt5}   (same crime group)`);
  console.log(`series@5:    ${summary.seriesRecallAt5}   (${seriesCases} series cases: a same-crew case among the 5 neighbours, from narrative alone)`);
  console.log(`x-district:  ${summary.seriesCrossDistrict}   (of those crew links, how many cross a district boundary)`);
  console.log(`latency:     ${summary.msPerQuery} ms/query`);
  const outDir = join(process.cwd(), "eval/results"); mkdirSync(outDir, { recursive: true });
  const name = `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}-similarity.json`;
  writeFileSync(join(outDir, name), JSON.stringify(summary, null, 2));
  console.log(`saved eval/results/${name}`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
