import { getCatalystApp, withCatalystTimeout } from "../catalyst-client";

// Requires a Data Store table named "AgentAuditLog" created in the Catalyst
// console (columns: RunId, EventType, Question, Tool, Args, Result, Status,
// ToolCallCount, FinalAnswer — all text except ToolCallCount as bigint). The
// SDK cannot create tables; this is a one-time manual console step, same as
// the QuickML pipeline. Until that table exists, writes fail and are
// swallowed below — chat keeps working without an audit trail.
const AUDIT_TABLE = "AgentAuditLog";

export interface AuditStepRecord {
  runId: string;
  question: string;
  tool: string;
  args: unknown;
  result: unknown;
  status: "ok" | "error";
}

export interface AuditRunRecord {
  runId: string;
  question: string;
  toolCallCount: number;
  finalAnswer: string;
}

/** Fire-and-forget: never throws, never awaited by callers. */
export async function logAuditStep(record: AuditStepRecord, req?: Request): Promise<void> {
  const app = getCatalystApp(req);
  if (!app) return;
  try {
    await withCatalystTimeout(
      app.datastore().table(AUDIT_TABLE).insertRow({
        RunId: record.runId,
        EventType: "step",
        Question: record.question,
        Tool: record.tool,
        Args: JSON.stringify(record.args),
        Result: JSON.stringify(record.result),
        Status: record.status,
      })
    );
  } catch (e) {
    console.warn("Catalyst audit-log step write failed:", (e as Error).message);
  }
}

/** Fire-and-forget: never throws, never awaited by callers. */
export async function logAuditRun(record: AuditRunRecord, req?: Request): Promise<void> {
  const app = getCatalystApp(req);
  if (!app) return;
  try {
    await withCatalystTimeout(
      app.datastore().table(AUDIT_TABLE).insertRow({
        RunId: record.runId,
        EventType: "run",
        Question: record.question,
        ToolCallCount: record.toolCallCount,
        FinalAnswer: record.finalAnswer,
      })
    );
  } catch (e) {
    console.warn("Catalyst audit-log run write failed:", (e as Error).message);
  }
}
