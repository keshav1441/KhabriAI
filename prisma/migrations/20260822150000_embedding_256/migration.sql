-- Embedding provider moved from Gemini (768-dim) to Mistral (mistral-embed, 256-dim).
-- The column was never populated on this database, so no data is lost.
DROP INDEX IF EXISTS "CaseMaster_BriefFactsEmbedding_hnsw_idx";
ALTER TABLE "CaseMaster" ALTER COLUMN "BriefFactsEmbedding" TYPE vector(256) USING NULL;
CREATE INDEX IF NOT EXISTS "CaseMaster_BriefFactsEmbedding_hnsw_idx" ON "CaseMaster"
  USING hnsw ("BriefFactsEmbedding" vector_cosine_ops);
