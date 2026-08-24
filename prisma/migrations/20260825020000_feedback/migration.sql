-- Answer feedback and the learned examples that come out of reviewing it.
CREATE TABLE "AnswerFeedback" (
    "id"           TEXT NOT NULL,
    "userId"       INTEGER NOT NULL,
    "sessionId"    TEXT,
    "messageId"    TEXT,
    "question"     TEXT NOT NULL,
    "answer"       TEXT,
    "sql"          TEXT,
    "tools"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "vote"         TEXT NOT NULL,
    "comment"      TEXT,
    "status"       TEXT NOT NULL DEFAULT 'new',
    "correctedSql" TEXT,
    "reviewedById" INTEGER,
    "reviewedAt"   TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnswerFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnswerFeedback_userId_messageId_key" ON "AnswerFeedback"("userId", "messageId");
CREATE INDEX "AnswerFeedback_status_createdAt_idx" ON "AnswerFeedback"("status", "createdAt");
CREATE INDEX "AnswerFeedback_vote_createdAt_idx" ON "AnswerFeedback"("vote", "createdAt");

ALTER TABLE "AnswerFeedback" ADD CONSTRAINT "AnswerFeedback_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "KhabriUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LearnedExample" (
    "id"         TEXT NOT NULL,
    "question"   TEXT NOT NULL,
    "sql"        TEXT NOT NULL,
    "source"     TEXT NOT NULL DEFAULT 'feedback',
    "feedbackId" TEXT,
    "embedding"  JSONB,
    "active"     BOOLEAN NOT NULL DEFAULT true,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearnedExample_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearnedExample_feedbackId_key" ON "LearnedExample"("feedbackId");
CREATE INDEX "LearnedExample_active_createdAt_idx" ON "LearnedExample"("active", "createdAt");

-- The scoped (non-owner) role reads learned examples during retrieval and
-- writes an officer's own feedback row; both are filtered by the app.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'khabri_scoped') THEN
    GRANT SELECT, INSERT, UPDATE ON "AnswerFeedback" TO khabri_scoped;
    GRANT SELECT ON "LearnedExample" TO khabri_scoped;
  END IF;
END $$;
