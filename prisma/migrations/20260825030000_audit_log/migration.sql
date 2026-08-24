-- Queryable audit trail: who asked what, which tools ran, under which scope.
CREATE TABLE "AgentAuditLog" (
    "id"            TEXT NOT NULL,
    "runId"         TEXT NOT NULL,
    "eventType"     TEXT NOT NULL,
    "userId"        INTEGER,
    "userEmail"     TEXT,
    "userRole"      TEXT,
    "districtId"    INTEGER,
    "districtName"  TEXT,
    "question"      TEXT NOT NULL,
    "tool"          TEXT,
    "args"          TEXT,
    "result"        TEXT,
    "status"        TEXT,
    "rowCount"      INTEGER,
    "durationMs"    INTEGER,
    "toolCallCount" INTEGER,
    "finalAnswer"   TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentAuditLog_createdAt_idx" ON "AgentAuditLog"("createdAt");
CREATE INDEX "AgentAuditLog_runId_idx" ON "AgentAuditLog"("runId");
CREATE INDEX "AgentAuditLog_userId_createdAt_idx" ON "AgentAuditLog"("userId", "createdAt");
CREATE INDEX "AgentAuditLog_tool_createdAt_idx" ON "AgentAuditLog"("tool", "createdAt");

-- No foreign key to KhabriUser on purpose: deleting an account must not erase
-- the record of what was asked under it. The email and role are copied in.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'khabri_scoped') THEN
    GRANT INSERT ON "AgentAuditLog" TO khabri_scoped;
  END IF;
END $$;
