-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "relatedCases" JSONB;

-- Full-text search index for semantic-ish case retrieval (lib/case-retrieval.ts)
CREATE INDEX IF NOT EXISTS "CaseMaster_BriefFacts_fts_idx" ON "CaseMaster"
  USING GIN (to_tsvector('english', coalesce("BriefFacts", '')));
