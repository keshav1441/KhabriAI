// Cross-language modus-operandi linking evaluation.
//   npx tsx scripts/enrich-kannada.ts        # build the slice first
//   npx tsx eval/cross-language.ts [--k=5]
//
// The corpus is English; real Karnataka FIRs are Kannada. If MO linking only
// works within one language it does not work on KSP's actual data. scripts/
// enrich-kannada.ts translated one case per offender series into Kannada and
// re-embedded it, keeping every original in the _KannadaBackup scratch table.
// This script asks the one question that matters: with a KANNADA narrative as
// the query and an ENGLISH corpus to search, does lib/case-retrieval.ts still
// find the same crew?
//
// Every metric is paired against a baseline computed from the SAME case's
// pre-translation English vector (stored in the backup table) over the SAME
// candidate pool, so the only variable is the language of the query:
//   seriesRecall@k  a same-series English case among the k neighbours - the
//                   known right answer, since narratives never name the accused
//   neighbourRecall@k  share of the case's own English top-k that survives
//                   translation (agreement with itself, no labels needed)
//   groupAgreement@k   share of neighbours in the same crime group
//   score distribution  cosine of the top hit, before vs after
// Translated cases are excluded from the candidate pool on BOTH sides, so a
// Kannada query is never scored against another Kannada narrative.
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/db";
import { similarCasesTo } from "../lib/case-retrieval";

const kArg = process.argv.find((a) => a.startsWith("--k="));
const K = kArg ? Number(kArg.split("=")[1]) : 5;
// Over-fetch depth is decided at runtime: Kannada narratives cluster hard with
// each other, so an unfiltered top-k can be ALL translated cases. Fetching
// k + sliceSize guarantees k English survivors remain after filtering.
let OVERFETCH = K + 20;

type Slice = { id: number; english: string; seriesKey: string };
type Neighbour = { id: number; score: number; briefFacts: string | null; grp: string | null; district: string | null };

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "n/a");

async function main() {
  const exists = await prisma.$queryRawUnsafe<{ t: string | null }[]>(`SELECT to_regclass('public."_KannadaBackup"')::text AS t`);
  if (!exists[0]?.t) {
    console.log("No _KannadaBackup table - run scripts/enrich-kannada.ts first.");
    return;
  }

  const slice = await prisma.$queryRawUnsafe<Slice[]>(
    `SELECT "CaseMasterID" AS id, "BriefFacts" AS english, "SeriesKey" AS "seriesKey" FROM "_KannadaBackup" ORDER BY "CaseMasterID"`
  );
  if (!slice.length) {
    console.log("Backup table is empty - nothing was translated.");
    return;
  }
  const translated = new Set(slice.map((s) => s.id));
  OVERFETCH = K + slice.length;
  const excludeList = slice.map((s) => s.id).join(",");

  // Which cases belong to which offender series - the ground truth the linker
  // must recover. Restricted to the series the slice actually covers.
  const membership = await prisma.$queryRawUnsafe<{ id: number; seriesKey: string }[]>(
    `SELECT DISTINCT cm."CaseMasterID" AS id, a."PersonID" || '|' || cm."CrimeMajorHeadID" AS "seriesKey"
     FROM "Accused" a JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID"
     WHERE a."PersonID" IS NOT NULL`
  );
  const seriesOf = new Map<number, Set<string>>();
  for (const m of membership) {
    if (!seriesOf.has(m.id)) seriesOf.set(m.id, new Set());
    seriesOf.get(m.id)!.add(m.seriesKey);
  }

  // Baseline neighbours come from the ORIGINAL vector parked in the backup
  // table - the linker's own query shape, just sourced from the pre-translation
  // embedding instead of the (now Kannada) live column.
  const baselineFor = (id: number) =>
    prisma.$queryRawUnsafe<Neighbour[]>(
      `WITH src AS (SELECT "BriefFactsEmbedding" AS e FROM "_KannadaBackup" WHERE "CaseMasterID" = ${id})
       SELECT cm."CaseMasterID" AS id, 1 - (cm."BriefFactsEmbedding" <=> src.e) AS score,
              cm."BriefFacts" AS "briefFacts", ch."CrimeGroupName" AS grp, d."DistrictName" AS district
       FROM "CaseMaster" cm
       LEFT JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
       LEFT JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
       LEFT JOIN "District" d ON d."DistrictID" = u."DistrictID", src
       WHERE cm."BriefFactsEmbedding" IS NOT NULL AND cm."CaseMasterID" NOT IN (${excludeList})
       ORDER BY cm."BriefFactsEmbedding" <=> src.e
       LIMIT ${K}`
    );

  const stat = {
    seriesBase: 0, seriesAfter: 0,
    groupBaseHits: 0, groupBaseTotal: 0, groupAfterHits: 0, groupAfterTotal: 0,
    overlap: 0, overlapTotal: 0,
    top1Base: [] as number[], top1After: [] as number[], meanBase: [] as number[], meanAfter: [] as number[],
    crossDistrict: 0,
    sameLangNeighbours: 0, sameLangTotal: 0,
  };
  const examples: Array<Record<string, unknown>> = [];
  const perCase: Array<Record<string, unknown>> = [];

  const t0 = Date.now();
  for (const c of slice) {
    const [base, rawAfter] = await Promise.all([
      baselineFor(c.id),
      similarCasesTo(c.id, { topK: OVERFETCH }), // the real linker, unmodified
    ]);
    // Before filtering: how much of the raw top-k is other KANNADA cases? This
    // is the honest measure of how strongly the embedding clusters by language
    // rather than by method, and it is the number that would sink the claim.
    for (const n of rawAfter.slice(0, K)) { stat.sameLangTotal++; if (translated.has(n.id)) stat.sameLangNeighbours++; }
    const after = rawAfter.filter((n) => !translated.has(n.id)).slice(0, K);
    if (!base.length || !after.length) continue;

    const own = c.seriesKey;
    const hasSeries = (ids: number[]) => ids.some((id) => seriesOf.get(id)?.has(own));
    const baseIds = base.map((n) => n.id);
    const afterIds = after.map((n) => n.id);

    const baseHit = hasSeries(baseIds);
    const afterHitId = afterIds.find((id) => seriesOf.get(id)?.has(own));
    if (baseHit) stat.seriesBase++;
    if (afterHitId) stat.seriesAfter++;

    const [self] = await prisma.$queryRawUnsafe<{ grp: string | null; district: string | null }[]>(
      `SELECT ch."CrimeGroupName" AS grp, d."DistrictName" AS district FROM "CaseMaster" cm
       LEFT JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
       LEFT JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
       LEFT JOIN "District" d ON d."DistrictID" = u."DistrictID" WHERE cm."CaseMasterID" = ${c.id}`
    );
    for (const n of base) { stat.groupBaseTotal++; if (n.grp === self?.grp) stat.groupBaseHits++; }
    for (const n of after) { stat.groupAfterTotal++; if (n.crimeGroup === self?.grp) stat.groupAfterHits++; }

    const survived = afterIds.filter((id) => baseIds.includes(id)).length;
    stat.overlap += survived;
    stat.overlapTotal += Math.min(K, baseIds.length);

    stat.top1Base.push(base[0].score);
    stat.top1After.push(after[0].score);
    stat.meanBase.push(mean(base.map((n) => n.score)));
    stat.meanAfter.push(mean(after.map((n) => n.score)));

    const afterHit = afterHitId ? after.find((n) => n.id === afterHitId)! : null;
    // A crew link that crosses a district boundary is one no single station could make.
    if (afterHit && afterHit.district && afterHit.district !== self?.district) stat.crossDistrict++;

    perCase.push({ id: c.id, seriesKey: own, baselineSeriesHit: baseHit, kannadaSeriesHit: Boolean(afterHitId), survivedTopK: survived, top1Base: r3(base[0].score), top1After: r3(after[0].score) });

    // Keep a handful of concrete Kannada -> English links for the write-up.
    if (afterHit && examples.length < 6) {
      const kan = await prisma.$queryRawUnsafe<{ t: string }[]>(`SELECT "BriefFacts" AS t FROM "CaseMaster" WHERE "CaseMasterID" = ${c.id}`);
      examples.push({
        caseId: c.id,
        kannadaNarrative: kan[0]?.t?.slice(0, 320),
        englishOriginal: c.english.slice(0, 320),
        matchedCaseId: afterHit.id,
        matchedEnglishNarrative: (afterHit.briefFacts ?? "").slice(0, 320),
        matchedScore: r3(afterHit.score),
        sameSeries: true,
        rank: afterIds.indexOf(afterHit.id) + 1,
      });
    }
    process.stdout.write(`\r  ${perCase.length}/${slice.length}  ${Math.round((Date.now() - t0) / 1000)}s`);
  }

  const n = perCase.length;
  const summary = {
    slice: n, k: K, corpus: "English", query: "Kannada (machine-translated from the same case's English narrative)",
    seriesRecallBaseline: pct(stat.seriesBase, n),
    seriesRecallCrossLanguage: pct(stat.seriesAfter, n),
    seriesRecallRetained: stat.seriesBase ? pct(stat.seriesAfter, stat.seriesBase) : "n/a",
    neighbourRecallAtK: pct(stat.overlap, stat.overlapTotal),
    sameLanguageShareOfRawTopK: pct(stat.sameLangNeighbours, stat.sameLangTotal),
    groupAgreementBaseline: pct(stat.groupBaseHits, stat.groupBaseTotal),
    groupAgreementCrossLanguage: pct(stat.groupAfterHits, stat.groupAfterTotal),
    top1ScoreBaseline: { mean: r3(mean(stat.top1Base)), median: r3(median(stat.top1Base)) },
    top1ScoreCrossLanguage: { mean: r3(mean(stat.top1After)), median: r3(median(stat.top1After)) },
    meanTopKScoreBaseline: r3(mean(stat.meanBase)),
    meanTopKScoreCrossLanguage: r3(mean(stat.meanAfter)),
    crossDistrictShareOfCrossLanguageHits: pct(stat.crossDistrict, stat.seriesAfter),
    msPerCase: n ? Math.round((Date.now() - t0) / n) : 0,
    examples,
    perCase,
  };

  console.log(`\n\nslice:            ${n} Kannada cases vs an English corpus, k=${K}`);
  console.log(`series recall:    ${summary.seriesRecallBaseline} English (baseline)  ->  ${summary.seriesRecallCrossLanguage} Kannada   (${summary.seriesRecallRetained} retained)`);
  console.log(`same-lang top-${K}:  ${summary.sameLanguageShareOfRawTopK}   (of the UNFILTERED top-${K}, how much is other Kannada text - clustering by language, not method)`);
  console.log(`neighbour recall: ${summary.neighbourRecallAtK}   (of each case's own English top-${K} still returned for the Kannada text)`);
  console.log(`x-district:      ${summary.crossDistrictShareOfCrossLanguageHits}   (of the Kannada crew links, how many cross a district boundary)`);
  console.log(`group agreement:  ${summary.groupAgreementBaseline} -> ${summary.groupAgreementCrossLanguage}`);
  console.log(`top-1 cosine:     ${summary.top1ScoreBaseline.mean} -> ${summary.top1ScoreCrossLanguage.mean} (mean)`);
  console.log(`mean top-${K}:      ${summary.meanTopKScoreBaseline} -> ${summary.meanTopKScoreCrossLanguage}`);
  console.log(`latency:          ${summary.msPerCase} ms/case`);

  const outDir = join(process.cwd(), "eval/results");
  mkdirSync(outDir, { recursive: true });
  const name = `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}-cross-language.json`;
  writeFileSync(join(outDir, name), JSON.stringify(summary, null, 2));
  console.log(`saved eval/results/${name}`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
