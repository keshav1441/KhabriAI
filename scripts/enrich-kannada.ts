// Translates a small slice of English FIR narratives into Kannada, in place,
// so the MO linker can be tested across languages.
//   npx tsx scripts/enrich-kannada.ts [--limit=200]
//   npx tsx scripts/enrich-kannada.ts --revert
//
// WHY: the seeded corpus is English, but real Karnataka FIRs are written in
// Kannada. If modus-operandi linking only works within one language it does
// not work on KSP's actual data. mistral-embed is multilingual, so the claim
// is testable — this script builds the test set, eval/cross-language.ts runs
// the experiment.
//
// WHY IN PLACE: lib/case-retrieval.ts reads CaseMaster.BriefFactsEmbedding.
// To test the REAL linker unmodified, the Kannada vector has to live in that
// column. So the slice is overwritten and every original is copied first into
// a runtime scratch table, "_KannadaBackup" (narrative + the original 1024-dim
// vector). No schema change, no migration: the table is created by this script
// and dropped by --revert, which restores both columns byte-for-byte and
// verifies the restore before dropping. A JSON side-file of the original
// narratives is written to eval/results/ as an out-of-database safety net.
//
// WHY CAPPED AT 200: the Mistral key is the user's own and rate-limits hard
// (429s at 5 concurrent requests in an earlier load test). Proving the claim
// needs a sample, not the corpus — the other ~19,800 narratives are untouched.
//
// One case per offender series is translated, never two: the rest of that
// series stays in English, so a recovered sibling is a genuine Kannada→English
// link with a known right answer.
import "dotenv/config";
import { writeFileSync, existsSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { Pool } from "pg";
import { getLlmClient } from "../lib/mistral-client";
import { embedTexts, EMBED_DIM, toVectorLiteral } from "../lib/embeddings";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const MODEL = process.env.MISTRAL_SUMMARY_MODEL ?? "mistral-small-latest";

const HARD_CAP = 200; // see header — the user's key, not ours
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = Math.min(limitArg ? Number(limitArg.split("=")[1]) : 200, HARD_CAP);
const REVERT = process.argv.includes("--revert");

// Narratives are long and Kannada costs ~3x the tokens of English, so batches
// stay small; concurrency 1 by default because this budget cannot afford a 429 storm.
const BATCH = 8;
const CONCURRENCY = Number(process.env.KANNADA_CONCURRENCY) || 1;

const BACKUP_TABLE = `"_KannadaBackup"`;
const SIDE_FILE = join(process.cwd(), "eval/results/kannada-slice-originals.json");
// Same invisible word-joiner scripts/enrich-briefs.ts stamps on enriched rows,
// so the Kannada text still reads as "enriched" to every other script.
const DONE_MARK = "⁠";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let apiCalls = 0;

interface Candidate {
  id: number;
  briefFacts: string;
  seriesKey: string;
}

async function ensureBackupTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${BACKUP_TABLE} (
       "CaseMasterID" integer PRIMARY KEY,
       "BriefFacts" text NOT NULL,
       "BriefFactsEmbedding" vector(${EMBED_DIM}),
       "SeriesKey" text,
       "TranslatedAt" timestamptz NOT NULL DEFAULT now()
     )`
  );
}

// One case per MO series (lowest id), only from series that still have a
// sibling left in English, and never a case already translated — so a re-run
// after a crash resumes instead of re-spending the budget.
async function fetchCandidates(limit: number): Promise<Candidate[]> {
  const { rows } = await pool.query(
    `WITH series AS (
       SELECT a."PersonID", cm."CrimeMajorHeadID"
       FROM "Accused" a JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID"
       WHERE a."PersonID" IS NOT NULL AND cm."BriefFactsEmbedding" IS NOT NULL
       GROUP BY 1, 2 HAVING COUNT(DISTINCT cm."CaseMasterID") >= 2
     ),
     member AS (
       SELECT DISTINCT a."PersonID" || '|' || cm."CrimeMajorHeadID" AS "seriesKey",
              cm."CaseMasterID" AS id, cm."BriefFacts" AS "briefFacts"
       FROM "Accused" a JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID"
       JOIN series s ON s."PersonID" = a."PersonID" AND s."CrimeMajorHeadID" = cm."CrimeMajorHeadID"
       WHERE cm."BriefFactsEmbedding" IS NOT NULL AND cm."BriefFacts" IS NOT NULL
     ),
     picked AS (
       SELECT DISTINCT ON ("seriesKey") "seriesKey", id, "briefFacts"
       FROM member m
       WHERE NOT EXISTS (SELECT 1 FROM ${BACKUP_TABLE} b WHERE b."CaseMasterID" = m.id)
       ORDER BY "seriesKey", id
     )
     -- A case with two accused belongs to two series and can be picked twice;
     -- keep it once or the second pass burns budget re-translating it.
     SELECT DISTINCT ON (id) "seriesKey", id, "briefFacts" FROM picked
     ORDER BY id, "seriesKey"
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function translate(batch: Candidate[], attempt = 0): Promise<Map<number, string>> {
  try {
    apiCalls++;
    const completion = await getLlmClient().chat.completions.create({
      model: MODEL,
      temperature: 0.2, // translation, not invention
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content:
            "You translate Karnataka Police FIR brief-facts narratives from English into Kannada. " +
            "Write natural Kannada in the register a Kannada FIR is actually written in - not word-for-word English word order. " +
            "Preserve every fact exactly: dates, times, amounts, vehicle make and colour, place names, method of entry, items taken. " +
            "Transliterate proper nouns into Kannada script. Do not add, drop or soften any detail. " +
            'Output ONLY a JSON array of {"id": <number>, "kannada": <string>} objects, one per input case, same order, no markdown, no commentary.',
        },
        { role: "user", content: JSON.stringify(batch.map((c) => ({ id: c.id, english: c.briefFacts.replace(/⁠/g, "") }))) },
      ],
    });
    const raw = (completion.choices[0]?.message?.content ?? "").trim();
    const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/```$/, "").trim();
    const parsed: Array<{ id: number; kannada: string }> = JSON.parse(cleaned);
    const out = new Map<number, string>();
    for (const { id, kannada } of parsed) {
      // A response that came back in Latin script is a failed translation, not a
      // translation of a Latin-script FIR — drop it rather than pollute the slice.
      if (typeof kannada === "string" && /[ಀ-೿]/.test(kannada) && kannada.length > 40) out.set(id, kannada.trim() + DONE_MARK);
    }
    return out;
  } catch (e) {
    const msg = (e as Error).message;
    if (/429|rate limit/i.test(msg) && attempt < 3) {
      const wait = 15_000 * (attempt + 1);
      process.stdout.write(`\n  429 on batch at case ${batch[0]?.id}; waiting ${wait / 1000}s\n`);
      await sleep(wait);
      return translate(batch, attempt + 1);
    }
    console.error(`\n  batch at case ${batch[0]?.id} failed: ${msg.slice(0, 200)}`);
    return new Map();
  }
}

async function embedWithRetry(texts: string[], attempt = 0): Promise<number[][]> {
  try {
    apiCalls++;
    return await embedTexts(texts);
  } catch (e) {
    const msg = (e as Error).message;
    if (/429|rate limit/i.test(msg) && attempt < 3) {
      await sleep(15_000 * (attempt + 1));
      return embedWithRetry(texts, attempt + 1);
    }
    throw e;
  }
}

// Backup row and overwrite happen in one transaction: a crash can leave a case
// untranslated, never translated-without-a-backup.
async function applyBatch(batch: Candidate[]): Promise<number> {
  const kannada = await translate(batch);
  const matched = batch.filter((c) => kannada.has(c.id));
  if (!matched.length) return 0;

  const vectors = await embedWithRetry(matched.map((c) => kannada.get(c.id)!));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < matched.length; i++) {
      const c = matched[i];
      await client.query(
        `INSERT INTO ${BACKUP_TABLE} ("CaseMasterID", "BriefFacts", "BriefFactsEmbedding", "SeriesKey")
         SELECT "CaseMasterID", "BriefFacts", "BriefFactsEmbedding", $2 FROM "CaseMaster" WHERE "CaseMasterID" = $1
         ON CONFLICT ("CaseMasterID") DO NOTHING`,
        [c.id, c.seriesKey]
      );
      await client.query(
        `UPDATE "CaseMaster" SET "BriefFacts" = $1, "BriefFactsEmbedding" = $2::vector(${EMBED_DIM}) WHERE "CaseMasterID" = $3`,
        [kannada.get(c.id), toVectorLiteral(vectors[i]), c.id]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return matched.length;
}

async function writeSideFile() {
  const { rows } = await pool.query(`SELECT "CaseMasterID" as id, "BriefFacts" as english, "SeriesKey" as "seriesKey" FROM ${BACKUP_TABLE} ORDER BY "CaseMasterID"`);
  mkdirSync(join(process.cwd(), "eval/results"), { recursive: true });
  writeFileSync(SIDE_FILE, JSON.stringify({ note: "originals of the Kannada slice; restore of record is the _KannadaBackup table", cases: rows }, null, 2));
}

async function revert() {
  const exists = await pool.query(`SELECT to_regclass('public."_KannadaBackup"') AS t`);
  if (!exists.rows[0].t) {
    console.log("Nothing to revert - no _KannadaBackup table.");
    return;
  }
  const { rows: before } = await pool.query(`SELECT count(*)::int n FROM ${BACKUP_TABLE}`);
  await pool.query(
    `UPDATE "CaseMaster" cm SET "BriefFacts" = b."BriefFacts", "BriefFactsEmbedding" = b."BriefFactsEmbedding"
     FROM ${BACKUP_TABLE} b WHERE cm."CaseMasterID" = b."CaseMasterID"`
  );
  // Verify before dropping the only copy: text identical and vector distance 0.
  const { rows: bad } = await pool.query(
    `SELECT count(*)::int n FROM "CaseMaster" cm JOIN ${BACKUP_TABLE} b ON b."CaseMasterID" = cm."CaseMasterID"
     WHERE cm."BriefFacts" IS DISTINCT FROM b."BriefFacts"
        OR (cm."BriefFactsEmbedding" <-> b."BriefFactsEmbedding") > 0`
  );
  if (bad[0].n > 0) {
    console.error(`Revert incomplete: ${bad[0].n}/${before[0].n} rows still differ. Backup table KEPT for retry.`);
    process.exitCode = 1;
    return;
  }
  await pool.query(`DROP TABLE ${BACKUP_TABLE}`);
  if (existsSync(SIDE_FILE)) unlinkSync(SIDE_FILE);
  console.log(`Reverted ${before[0].n} cases - narratives and embeddings verified identical, scratch table dropped.`);
}

async function main() {
  if (REVERT) return revert();

  await ensureBackupTable();
  const cases = await fetchCandidates(LIMIT);
  const { rows: already } = await pool.query(`SELECT count(*)::int n FROM ${BACKUP_TABLE}`);
  if (!cases.length) {
    console.log(`Nothing to do - ${already[0].n} cases already translated. Use --revert to restore.`);
    return;
  }

  const batches: Candidate[][] = [];
  for (let i = 0; i < cases.length; i += BATCH) batches.push(cases.slice(i, i + BATCH));
  console.log(`Translating ${cases.length} cases to Kannada (${already[0].n} already done; ${batches.length} batches of ${BATCH}, concurrency ${CONCURRENCY})...`);

  let done = 0;
  const t0 = Date.now();
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const results = await Promise.allSettled(batches.slice(i, i + CONCURRENCY).map(applyBatch));
    for (const r of results) {
      if (r.status === "fulfilled") done += r.value;
      else console.error("\n  batch failed:", (r.reason as Error).message.slice(0, 160));
    }
    process.stdout.write(`\r  ${done}/${cases.length} translated  ${Math.round((Date.now() - t0) / 1000)}s  (${apiCalls} api calls)`);
  }

  await writeSideFile();
  console.log(`\nDone - ${done}/${cases.length} cases now hold Kannada narratives, ${apiCalls} Mistral calls spent.`);
  console.log(`Originals in _KannadaBackup + eval/results/kannada-slice-originals.json. Revert: npx tsx scripts/enrich-kannada.ts --revert`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
