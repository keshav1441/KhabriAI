import "dotenv/config";
import { Pool } from "pg";
import { getGroqClient } from "../lib/groq-client";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const MODEL = process.env.GROQ_SUMMARY_MODEL ?? "llama-3.1-8b-instant";
const BATCH = 25;

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : undefined;

interface CaseRow {
  id: number;
  crimeType: string | null;
  district: string | null;
  status: string | null;
  regDate: string | null;
}

async function fetchTemplatedCases(limit?: number): Promise<CaseRow[]> {
  const { rows } = await pool.query(
    `SELECT cm."CaseMasterID" as id, csh."CrimeHeadName" as "crimeType",
            d."DistrictName" as district, cs."CaseStatusName" as status,
            cm."CrimeRegisteredDate" as "regDate"
     FROM "CaseMaster" cm
     LEFT JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
     LEFT JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
     LEFT JOIN "District" d ON d."DistrictID" = u."DistrictID"
     LEFT JOIN "CaseStatusMaster" cs ON cs."CaseStatusID" = cm."CaseStatusID"
     WHERE cm."BriefFacts" ILIKE '%reported at station%'
     ORDER BY cm."CaseMasterID"
     ${limit ? "LIMIT $1" : ""}`,
    limit ? [limit] : []
  );
  return rows;
}

async function generateNarratives(batch: CaseRow[]): Promise<Map<number, string>> {
  const groq = getGroqClient();
  const cases = batch.map((c) => ({
    id: c.id,
    crimeType: c.crimeType ?? "Unknown",
    district: c.district ?? "Unknown",
    status: c.status ?? "Under Investigation",
    date: c.regDate ? new Date(c.regDate).toISOString().slice(0, 10) : "unknown date",
  }));

  const completion = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.9,
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content:
          "You write realistic, varied FIR brief-facts narratives for a synthetic Karnataka Police training dataset. " +
          "For each case given, write a 2-4 sentence police-report-style narrative: what happened, where, and any relevant detail " +
          "(time of day, method, relationship between parties, items involved) consistent with the crime type. Vary phrasing and " +
          "specifics across cases — do not repeat the same sentence structure. Output ONLY a JSON array of " +
          '{"id": <number>, "narrative": <string>} objects, one per input case, same order, no markdown, no commentary.',
      },
      { role: "user", content: JSON.stringify(cases) },
    ],
  });

  const raw = (completion.choices[0]?.message?.content ?? "").trim();
  const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/```$/, "").trim();
  const parsed: Array<{ id: number; narrative: string }> = JSON.parse(cleaned);

  const out = new Map<number, string>();
  for (const { id, narrative } of parsed) out.set(id, narrative);
  return out;
}

const CONCURRENCY = 8;

async function processBatch(batch: CaseRow[]): Promise<number> {
  try {
    const narratives = await generateNarratives(batch);
    const matched = batch.filter((c) => narratives.has(c.id));
    await Promise.all(
      matched.map((c) =>
        pool.query(`UPDATE "CaseMaster" SET "BriefFacts" = $1 WHERE "CaseMasterID" = $2`, [
          narratives.get(c.id),
          c.id,
        ])
      )
    );
    return matched.length;
  } catch (e) {
    console.error(`\nBatch starting at case ${batch[0]?.id} failed:`, (e as Error).message);
    return 0;
  }
}

async function main() {
  const cases = await fetchTemplatedCases(LIMIT);
  const batches = [];
  for (let i = 0; i < cases.length; i += BATCH) batches.push(cases.slice(i, i + BATCH));
  console.log(`Enriching ${cases.length} cases (${batches.length} batches of ${BATCH}, concurrency ${CONCURRENCY})...`);

  let done = 0;
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(processBatch));
    done += results.reduce((a, b) => a + b, 0);
    process.stdout.write(`\r  ${done}/${cases.length}`);
  }
  console.log(`\nDone — enriched ${done}/${cases.length} cases.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
