import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/db";
import { similarCasesTo } from "../lib/case-retrieval";

after(() => prisma.$disconnect());

// DB-backed: needs at least a few embedded narratives (scripts/backfill-embeddings.ts).
test("similarCasesTo returns nearest cases by narrative, never the case itself, best first", async (t) => {
  const seed = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT "CaseMasterID" AS id FROM "CaseMaster" WHERE "BriefFactsEmbedding" IS NOT NULL LIMIT 1`
  );
  if (!seed.length) { t.skip("no embeddings yet"); return; }
  const out = await similarCasesTo(seed[0].id, { topK: 5 });
  assert.ok(out.length > 0 && out.length <= 5);
  assert.ok(out.every((c) => c.id !== seed[0].id));
  for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].score >= out[i].score);
  assert.ok(out[0].briefFacts && out[0].district && out[0].crimeType);
});

test("similarCasesTo can exclude the source district (cross-jurisdiction links)", async (t) => {
  const seed = await prisma.$queryRawUnsafe<{ id: number; district: string }[]>(
    `SELECT cm."CaseMasterID" AS id, d."DistrictName" AS district FROM "CaseMaster" cm
     JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID" JOIN "District" d ON d."DistrictID" = u."DistrictID"
     WHERE cm."BriefFactsEmbedding" IS NOT NULL LIMIT 1`
  );
  if (!seed.length) { t.skip("no embeddings yet"); return; }
  const out = await similarCasesTo(seed[0].id, { topK: 5, excludeDistrict: seed[0].district });
  assert.ok(out.every((c) => c.district !== seed[0].district));
});
