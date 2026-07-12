import "dotenv/config";
import { prisma } from "./lib/db";
import { embedTexts } from "./lib/embeddings-gemini";

// Gemini free tier: 100 embed requests/minute, and one batchEmbedContents call
// with N texts counts as N requests — so batch size must stay under the
// per-minute cap, and we pace proactively between batches to avoid churning
// on 429s the whole run.
const BATCH_SIZE = 90;
const PACE_MS = 62_000;

function parseRetryDelaySeconds(message: string): number | null {
  const m = message.match(/retry in (\d+(?:\.\d+)?)s/i);
  return m ? parseFloat(m[1]) : null;
}

async function embedWithRetry(texts: string[]): Promise<number[][]> {
  for (;;) {
    try {
      return await embedTexts(texts);
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED")) {
        const delay = parseRetryDelaySeconds(message) ?? 60;
        console.warn(`  rate limited, waiting ${delay + 2}s...`);
        await new Promise((r) => setTimeout(r, (delay + 2) * 1000));
        continue;
      }
      throw e; // non-rate-limit error — real bug, don't loop forever
    }
  }
}

async function main() {
  const rows = await prisma.$queryRaw<{ CaseMasterID: number; BriefFacts: string }[]>`
    SELECT "CaseMasterID", "BriefFacts" FROM "CaseMaster"
    WHERE "BriefFactsEmbedding" IS NULL AND "BriefFacts" IS NOT NULL
    ORDER BY "CaseMasterID"
  `;
  console.log(`Backfilling embeddings for ${rows.length} cases (~${Math.ceil(rows.length / BATCH_SIZE * PACE_MS / 60000)} min)...`);

  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batchStart = Date.now();
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const embeddings = await embedWithRetry(chunk.map((r) => r.BriefFacts));

    const values = chunk.map((r, j) => `(${r.CaseMasterID}, '[${embeddings[j].join(",")}]'::vector)`).join(",");
    await prisma.$executeRawUnsafe(
      `UPDATE "CaseMaster" AS cm SET "BriefFactsEmbedding" = v.embedding
       FROM (VALUES ${values}) AS v(id, embedding)
       WHERE cm."CaseMasterID" = v.id`
    );

    done += chunk.length;
    process.stdout.write(`\r  ${done}/${rows.length}`);

    const elapsed = Date.now() - batchStart;
    if (i + BATCH_SIZE < rows.length && elapsed < PACE_MS) {
      await new Promise((r) => setTimeout(r, PACE_MS - elapsed));
    }
  }
  console.log("\nBackfill complete.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
