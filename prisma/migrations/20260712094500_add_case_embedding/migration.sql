-- Semantic similarity search for related cases (lib/case-retrieval.ts),
-- replacing/augmenting the tsvector full-text search which misses
-- paraphrases (e.g. "theft" vs "stolen").
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "CaseMaster" ADD COLUMN "BriefFactsEmbedding" vector(768);

CREATE INDEX IF NOT EXISTS "CaseMaster_BriefFactsEmbedding_hnsw_idx" ON "CaseMaster"
  USING hnsw ("BriefFactsEmbedding" vector_cosine_ops);
