-- mistral-embed is 1024-dim (the 256 reading came from the SDK's base64 default
-- mis-decoding Mistral's float response). Nothing valid was stored yet.
DROP INDEX IF EXISTS "CaseMaster_BriefFactsEmbedding_hnsw_idx";
ALTER TABLE "CaseMaster" ALTER COLUMN "BriefFactsEmbedding" TYPE vector(1024) USING NULL;
CREATE INDEX IF NOT EXISTS "CaseMaster_BriefFactsEmbedding_hnsw_idx" ON "CaseMaster"
  USING hnsw ("BriefFactsEmbedding" vector_cosine_ops);
