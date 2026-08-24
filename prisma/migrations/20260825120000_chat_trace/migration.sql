-- The working behind an answer and the groundedness verdict on it were both
-- streamed to the browser and then thrown away: reopening a session lost the
-- trace, and an answer carrying an unverified-figure warning came back looking
-- clean. Stored the same way rows/relatedCases already are.
ALTER TABLE "ChatMessage" ADD COLUMN "trace" JSONB;
ALTER TABLE "ChatMessage" ADD COLUMN "groundedness" JSONB;
