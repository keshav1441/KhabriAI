// Expands the seed's templated BriefFacts ("Burglary reported at station 91.")
// into realistic FIR narratives so case similarity / citations have text to work on.
//   npx tsx scripts/enrich-briefs.ts [--limit=N]
//
// Modus operandi series: when the same repeat offender (Accused.PersonID) has
// two or more cases in the same crime group, those cases share a consistent,
// deterministic MO signature (entry method, time, target, vehicle, signature
// habit) the way a real crew's FIRs do. Narratives never name the accused, so
// similarity links on METHOD, not on names. See PROTOTYPE_BRIEF.md, "Data".
import "dotenv/config";
import { Pool } from "pg";
import { getLlmClient } from "../lib/mistral-client";
import { moSignature } from "../lib/mo-signature";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const MODEL = process.env.MISTRAL_SUMMARY_MODEL ?? "mistral-small-latest";
const BATCH = 25;
// ponytail: Mistral free/low tiers 429 above ~3 concurrent chat calls; override with ENRICH_CONCURRENCY.
const CONCURRENCY = Number(process.env.ENRICH_CONCURRENCY) || 3;

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : undefined;

interface CaseRow {
  id: number;
  crimeType: string | null;
  crimeGroup: string | null;
  district: string | null;
  status: string | null;
  regDate: string | null;
  seriesKey: string | null; // "<PersonID>|<CrimeGroup>" when part of an MO series
}

async function fetchTemplatedCases(limit?: number): Promise<CaseRow[]> {
  const { rows } = await pool.query(
    `WITH series AS (
       SELECT a."PersonID", cm."CrimeMajorHeadID"
       FROM "Accused" a JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID"
       WHERE a."PersonID" IS NOT NULL
       GROUP BY 1, 2 HAVING COUNT(DISTINCT cm."CaseMasterID") >= 2
     ),
     case_series AS (
       SELECT DISTINCT ON (a."CaseMasterID") a."CaseMasterID", a."PersonID"
       FROM "Accused" a JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID"
       JOIN series s ON s."PersonID" = a."PersonID" AND s."CrimeMajorHeadID" = cm."CrimeMajorHeadID"
       ORDER BY a."CaseMasterID", a."PersonID"
     )
     SELECT cm."CaseMasterID" as id, csh."CrimeHeadName" as "crimeType", ch."CrimeGroupName" as "crimeGroup",
            d."DistrictName" as district, cs."CaseStatusName" as status,
            cm."CrimeRegisteredDate" as "regDate",
            CASE WHEN x."PersonID" IS NULL THEN NULL ELSE x."PersonID" || '|' || COALESCE(ch."CrimeGroupName", '') END as "seriesKey"
     FROM "CaseMaster" cm
     LEFT JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
     LEFT JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
     LEFT JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
     LEFT JOIN "District" d ON d."DistrictID" = u."DistrictID"
     LEFT JOIN "CaseStatusMaster" cs ON cs."CaseStatusID" = cm."CaseStatusID"
     LEFT JOIN case_series x ON x."CaseMasterID" = cm."CaseMasterID"
     WHERE cm."BriefFacts" ILIKE '%reported at station%'
     ORDER BY cm."CaseMasterID"
     ${limit ? "LIMIT $1" : ""}`,
    limit ? [limit] : []
  );
  return rows;
}

async function generateNarratives(batch: CaseRow[]): Promise<Map<number, string>> {
  const llm = getLlmClient();
  const cases = batch.map((c) => ({
    id: c.id,
    crimeType: c.crimeType ?? "Unknown",
    district: c.district ?? "Unknown",
    status: c.status ?? "Under Investigation",
    date: c.regDate ? new Date(c.regDate).toISOString().slice(0, 10) : "unknown date",
    ...(c.seriesKey ? { modusOperandi: moSignature(c.seriesKey, c.crimeGroup ?? "") } : {}),
  }));

  const completion = await llm.chat.completions.create({
    model: MODEL,
    temperature: 0.9,
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content:
          "You write realistic, varied FIR brief-facts narratives for a synthetic Karnataka Police training dataset. " +
          "For each case given, write a 2-4 sentence police-report-style narrative: what happened, where, and relevant detail " +
          "(time, method, items, relationship between parties) consistent with the crime type. Vary phrasing and specifics across cases. " +
          "Never name the accused or suspects - refer to them as unknown persons, the accused, a man/woman, etc. Complainants and victims may have plausible Kannadiga names. " +
          "If a case has a modusOperandi object, weave EVERY one of its details naturally into the narrative (they describe a repeat crew's consistent method) without listing them as fields. " +
          "Output ONLY a JSON array of {\"id\": <number>, \"narrative\": <string>} objects, one per input case, same order, no markdown, no commentary.",
      },
      { role: "user", content: JSON.stringify(cases) },
    ],
  });

  const raw = (completion.choices[0]?.message?.content ?? "").trim();
  const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/```$/, "").trim();
  const parsed: Array<{ id: number; narrative: string }> = JSON.parse(cleaned);

  const out = new Map<number, string>();
  for (const { id, narrative } of parsed) if (typeof narrative === "string" && narrative.length > 40) out.set(id, narrative);
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function processBatch(batch: CaseRow[], attempt = 0): Promise<number> {
  try {
    const narratives = await generateNarratives(batch);
    const matched = batch.filter((c) => narratives.has(c.id));
    await Promise.all(
      matched.map((c) =>
        pool.query(`UPDATE "CaseMaster" SET "BriefFacts" = $1 WHERE "CaseMasterID" = $2`, [narratives.get(c.id), c.id])
      )
    );
    return matched.length;
  } catch (e) {
    const msg = (e as Error).message;
    // Rate limited: the SDK already retried with backoff; let the window clear, then try once more.
    if (msg.includes("429") && attempt < 1) { await sleep(15_000); return processBatch(batch, attempt + 1); }
    console.error(`\nBatch starting at case ${batch[0]?.id} failed:`, msg.slice(0, 200));
    return 0;
  }
}

async function main() {
  const cases = await fetchTemplatedCases(LIMIT);
  const inSeries = cases.filter((c) => c.seriesKey).length;
  const batches: CaseRow[][] = [];
  for (let i = 0; i < cases.length; i += BATCH) batches.push(cases.slice(i, i + BATCH));
  console.log(`Enriching ${cases.length} cases (${inSeries} in MO series; ${batches.length} batches of ${BATCH}, concurrency ${CONCURRENCY})...`);

  let done = 0;
  const t0 = Date.now();
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(processBatch));
    done += results.reduce((a, b) => a + b, 0);
    process.stdout.write(`\r  ${done}/${cases.length}  ${Math.round((Date.now() - t0) / 1000)}s`);
  }
  console.log(`\nDone - enriched ${done}/${cases.length} cases.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
