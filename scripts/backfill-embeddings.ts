// Embeds CaseMaster.BriefFacts into BriefFactsEmbedding (vector(1024), Mistral).
//   npx tsx scripts/backfill-embeddings.ts [--force]
// Only enriched narratives are embedded; templated seed briefs
// ("Burglary reported at station 91.") carry no method information.
import "dotenv/config";
import { prisma } from "../lib/db";
import { embedTexts, EMBED_DIM } from "../lib/embeddings";

const BATCH_SIZE = 100;
const CONCURRENCY = 4;
const force = process.argv.includes("--force");

async function embedBatch(rows: { CaseMasterID: number; BriefFacts: string }[]): Promise<number> {
  const embeddings = await embedTexts(rows.map((r) => r.BriefFacts));
  const values = rows.map((r, j) => `(${r.CaseMasterID}, '[${embeddings[j].join(",")}]'::vector(${EMBED_DIM}))`).join(",");
  await prisma.$executeRawUnsafe(
    `UPDATE "CaseMaster" AS cm SET "BriefFactsEmbedding" = v.embedding
     FROM (VALUES ${values}) AS v(id, embedding)
     WHERE cm."CaseMasterID" = v.id`
  );
  return rows.length;
}

async function main() {
  const rows = await prisma.$queryRawUnsafe<{ CaseMasterID: number; BriefFacts: string }[]>(
    `SELECT "CaseMasterID", "BriefFacts" FROM "CaseMaster"
     WHERE "BriefFacts" IS NOT NULL AND "BriefFacts" NOT ILIKE '%reported at station%'
       ${force ? "" : 'AND "BriefFactsEmbedding" IS NULL'}
     ORDER BY "CaseMasterID"`
  );
  console.log(`Embedding ${rows.length} narratives (batch ${BATCH_SIZE}, concurrency ${CONCURRENCY})...`);
  const batches: (typeof rows)[] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) batches.push(rows.slice(i, i + BATCH_SIZE));

  let done = 0;
  const t0 = Date.now();
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const results = await Promise.allSettled(batches.slice(i, i + CONCURRENCY).map(embedBatch));
    for (const r of results) {
      if (r.status === "fulfilled") done += r.value;
      else console.error("\nbatch failed:", (r.reason as Error).message.slice(0, 160));
    }
    process.stdout.write(`\r  ${done}/${rows.length}  ${Math.round((Date.now() - t0) / 1000)}s`);
  }
  console.log(`\nBackfill complete: ${done}/${rows.length}.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); process.exit(1); });
