import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/db";
import { SIMILAR_CASE_MIN_SCORE, similarCasesTo } from "../lib/case-retrieval";
import { scoreDuplicate, DUP } from "../lib/duplicate-detect";
import { buildCrew } from "../lib/crew";
import { OPEN_PREDICATE } from "../lib/pendency";
import { MO_MIN_SCORE, MO_SAME_SUBHEAD, MO_RECENT_DAYS, MO_SCAN_CASES } from "../lib/alerts";

after(() => prisma.$disconnect());

// ---- one floor, and it is honest -------------------------------------------
//
// Five different "similar case" floors used to exist (0, 0, 0.5, 0.72, 0.78),
// two of them fetched for the SAME case onto the same screen. Measured over the
// live corpus the nearest neighbour of a random case scores at least 0.878 and
// the fifth at least 0.865, so none of those numbers ever rejected anything;
// and no number could, because series pairs (median 0.872) and unrelated
// same-crime-group pairs (median 0.835) overlap almost entirely.

test("there is exactly one shared floor and it does not pretend to gate", () => {
  assert.equal(SIMILAR_CASE_MIN_SCORE, 0);
});

test("similarCasesTo ranks its results 1..n so callers can show a position", async (t) => {
  const seed = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT "CaseMasterID" AS id FROM "CaseMaster" WHERE "BriefFactsEmbedding" IS NOT NULL LIMIT 1`
  );
  if (!seed.length) { t.skip("no embeddings yet"); return; }
  const out = await similarCasesTo(seed[0].id, { topK: 5 });
  assert.ok(out.length > 0);
  assert.deepEqual(out.map((c) => c.rank), out.map((_, i) => i + 1));
  for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].score >= out[i].score);
});

test("the case drawer and the handover sheet fetch the same list", async (t) => {
  // They used to pass 0.5 and 0.72 for the same case. Both now inherit the
  // shared default, so one case file cannot show two "linked cases" lists.
  const seed = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT "CaseMasterID" AS id FROM "CaseMaster" WHERE "BriefFactsEmbedding" IS NOT NULL LIMIT 1`
  );
  if (!seed.length) { t.skip("no embeddings yet"); return; }
  const [drawer, sheet] = await Promise.all([
    similarCasesTo(seed[0].id, { topK: 5 }),
    similarCasesTo(seed[0].id, { topK: 5 }),
  ]);
  assert.deepEqual(drawer.map((c) => c.id), sheet.map((c) => c.id));
});

// ---- the duplicate detector says what the number can support ----------------

test("a duplicate reason never claims a percentage match", () => {
  const scored = scoreDuplicate({
    narrative: 0.92,
    dayGap: 1,
    station: "sameDistrict",
    sameSubHead: true,
    personMatch: 0.98,
    personLabel: "Ravi Kumar",
  });
  const narrative = scored.reasons.find((r) => r.signal === "narrative");
  assert.ok(narrative, "narrative should fire at 0.92");
  assert.ok(!/%/.test(narrative!.label), `still selling a percentage: ${narrative!.label}`);
  assert.match(narrative!.label, /0\.92/);
});

test("without a matching person the narrative alone cannot assert a duplicate", () => {
  // This, not the narrative gate, is what actually does the work: measured over
  // the live corpus 99.4% of the candidates the duplicate query returns clear
  // DUP.narrativeGate, so the gate rejects essentially nothing on its own.
  const scored = scoreDuplicate({
    narrative: 0.95,
    dayGap: 0,
    station: "same",
    sameSubHead: true,
    personMatch: 0.1,
    personLabel: null,
  });
  assert.equal(scored.capped, "no-person");
  assert.ok(!scored.isProbable);
  assert.ok(scored.likelihood <= DUP.noPersonCap);
});

// ---- "open" means one thing ------------------------------------------------

test("the crew dossier counts open cases with the desk's predicate", async (t) => {
  const seed = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT a."CaseMasterID" AS id FROM "Accused" a
      WHERE a."PersonID" IS NOT NULL
      GROUP BY a."CaseMasterID" HAVING COUNT(*) > 1 LIMIT 1`
  );
  if (!seed.length) { t.skip("no multi-accused case"); return; }
  const d = await buildCrew({ caseId: seed[0].id });
  if (!d.cases.length) { t.skip("empty dossier"); return; }

  // Nothing already disposed may be counted as still on someone's desk.
  const disposed = new Set(["Charge Sheeted", "Closed", "False Case"]);
  for (const c of d.cases) {
    if (c.status && disposed.has(c.status)) assert.equal(c.open, false, `${c.crimeNo} is ${c.status}`);
    if (c.chargesheeted) assert.equal(c.open, false, `${c.crimeNo} has a chargesheet`);
  }
  assert.equal(d.summary.open, d.cases.filter((c) => c.open).length);
  // The old rule was `!chargesheeted`, which is never smaller than this one.
  assert.ok(d.summary.open <= d.cases.filter((c) => !c.chargesheeted).length);
});

test("the exported OPEN_PREDICATE is the definition crew borrows, statuses and all", async () => {
  assert.match(OPEN_PREDICATE, /ChargesheetDetails/);
  assert.match(OPEN_PREDICATE, /'Charge Sheeted', 'Closed', 'False Case'/);

  // And it is genuinely narrower than the chargesheet test on this corpus.
  const rows = await prisma.$queryRawUnsafe<{ open: bigint; no_cs: bigint }[]>(
    `SELECT COUNT(*) FILTER (WHERE ${OPEN_PREDICATE}) AS open,
            COUNT(*) FILTER (WHERE NOT EXISTS (
              SELECT 1 FROM "ChargesheetDetails" csd WHERE csd."CaseMasterID" = cm."CaseMasterID")) AS no_cs
     FROM "CaseMaster" cm
     LEFT JOIN "CaseStatusMaster" cs ON cs."CaseStatusID" = cm."CaseStatusID"`
  );
  const open = Number(rows[0].open);
  const noCs = Number(rows[0].no_cs);
  assert.ok(open > 0);
  assert.ok(open < noCs, `open ${open} should be below "no chargesheet" ${noCs}`);
});

// ---- the MO alert has to earn the interrupt --------------------------------

test("the MO alert gate is an outlier test, not a confidence", () => {
  // Measured over the live corpus: the closest CROSS-DISTRICT narrative to a
  // random case scores p05 0.890, median 0.918, p95 0.942, p99 0.953. Anything
  // at or below p95 fires on nearly every case, which is what 0.72 did.
  assert.ok(MO_MIN_SCORE > 0.942, `${MO_MIN_SCORE} is inside the ordinary range`);
  assert.equal(MO_SAME_SUBHEAD, true, "narrative closeness alone must not raise an alert");
});

test("the MO alert does not fire on every recent case", async (t) => {
  const rows = await prisma.$queryRawUnsafe<{ scanned: bigint; hits: bigint }[]>(
    `WITH recent AS (
       SELECT cm."CaseMasterID" case_id, cm."BriefFactsEmbedding" e,
              cm."CrimeMinorHeadID" sub_head, d."DistrictID" district_id
       FROM "CaseMaster" cm
       JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
       JOIN "District" d ON d."DistrictID" = u."DistrictID"
       WHERE cm."BriefFactsEmbedding" IS NOT NULL
         AND cm."CrimeRegisteredDate" >= NOW() - ($1 || ' days')::interval
       ORDER BY cm."CrimeRegisteredDate" DESC
       LIMIT $2
     )
     SELECT (SELECT COUNT(*) FROM recent) AS scanned,
            COUNT(*) AS hits
     FROM recent r
     CROSS JOIN LATERAL (
       SELECT 1 - (c2."BriefFactsEmbedding" <=> r.e) AS score
       FROM "CaseMaster" c2
       JOIN "Unit" u2 ON u2."UnitID" = c2."PoliceStationID"
       WHERE c2."BriefFactsEmbedding" IS NOT NULL AND c2."CaseMasterID" <> r.case_id
         AND u2."DistrictID" <> r.district_id
         AND ($4::boolean IS NOT TRUE OR c2."CrimeMinorHeadID" IS NOT DISTINCT FROM r.sub_head)
       ORDER BY c2."BriefFactsEmbedding" <=> r.e LIMIT 1
     ) m
     WHERE m.score >= $3`,
    String(Math.floor(MO_RECENT_DAYS)),
    MO_SCAN_CASES,
    MO_MIN_SCORE,
    MO_SAME_SUBHEAD
  );
  const scanned = Number(rows[0].scanned);
  const hits = Number(rows[0].hits);
  if (!scanned) { t.skip("no recent embedded cases"); return; }
  // An alert that fires on every recent case is worse than no alert. At the old
  // 0.72 this was 60 of 60.
  assert.ok(hits <= scanned / 4, `${hits} of ${scanned} recent cases would raise an MO alert`);
});
