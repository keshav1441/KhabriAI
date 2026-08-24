import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getCatalystApp, withCatalystTimeout } from "../catalyst-client";
import { prisma } from "../db";
import type { GroundednessVerdict } from "../groundedness";

// The audit trail is written three ways, for three different readers.
//   Postgres  - the one the app can query, and what /admin/audit reads. It
//               records the officer and the scope their query actually ran
//               under, which the other two sinks never did.
//   Catalyst  - the Data Store table, kept because it is off-box: an operator
//               who can edit the application database cannot quietly edit it.
//   JSONL     - a local file for a laptop demo with no Catalyst and, more
//               usefully, a sink that still works when the database is the
//               thing that broke.
// All three are fire-and-forget. An audit write must never fail a query an
// officer is waiting on, and must never throw into the streaming response.
const LOCAL_AUDIT_DIR = join(process.cwd(), ".audit");
const LOCAL_AUDIT_FILE = join(LOCAL_AUDIT_DIR, "agent-audit.jsonl");

// Enough to reconstruct what a tool was asked and what it answered, without
// making the audit table a second copy of the case database.
const MAX_ARGS = 2000;
const MAX_RESULT = 4000;
const MAX_ANSWER = 8000;

async function logLocal(record: object): Promise<void> {
  try {
    await mkdir(LOCAL_AUDIT_DIR, { recursive: true });
    await appendFile(LOCAL_AUDIT_FILE, JSON.stringify({ ...record, at: new Date().toISOString() }) + "\n");
  } catch (e) {
    console.warn("local audit-log write failed:", (e as Error).message);
  }
}

// Requires a Data Store table named "AgentAuditLog" created in the Catalyst
// console (columns: RunId, EventType, Question, Tool, Args, Result, Status,
// ToolCallCount, FinalAnswer — all text except ToolCallCount as bigint). The
// SDK cannot create tables; this is a one-time manual console step, same as
// the QuickML pipeline. Until that table exists, writes fail and are
// swallowed — chat keeps working without the off-box copy.
const AUDIT_TABLE = "AgentAuditLog";

/** Who ran the query, and how far their posting let them see. */
export interface AuditActor {
  userId?: number | null;
  email?: string | null;
  role?: string | null;
  districtId?: number | null;
  districtName?: string | null;
}

export interface AuditStepRecord {
  runId: string;
  question: string;
  tool: string;
  args: unknown;
  result: unknown;
  status: "ok" | "error";
  durationMs?: number;
  actor?: AuditActor;
}

export interface AuditRunRecord {
  runId: string;
  question: string;
  toolCallCount: number;
  finalAnswer: string;
  durationMs?: number;
  actor?: AuditActor;
  /** Verdict of the groundedness guard on `finalAnswer`, when it ran. */
  groundedness?: GroundednessVerdict;
}

// A run row leaves `status` and `result` null - they only ever described a tool
// step. Reusing them for the verdict keeps the audit answerable ("show me the
// answers with an unverified figure") with no schema change: `status` is the
// one-word verdict, `result` the claims behind it.
function groundednessFields(verdict?: GroundednessVerdict) {
  if (!verdict) return { status: null, result: null, rowCount: null };
  return {
    status: verdict.checked === 0 ? "no-figures" : verdict.grounded ? "grounded" : "ungrounded",
    result: clip({ groundedness: { checked: verdict.checked, claims: verdict.claims } }, MAX_RESULT),
    rowCount: null,
  };
}

/** @internal exposed for tests */
export function clip(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}… [truncated ${text.length - max} chars]` : text;
}

/** Row counts are the interesting part of a result: how much data was seen.
 *  @internal exposed for tests */
export function rowsIn(result: unknown): number | null {
  const rows = (result as { rows?: unknown[] } | null)?.rows;
  return Array.isArray(rows) ? rows.length : null;
}

function actorFields(actor?: AuditActor) {
  return {
    userId: actor?.userId ?? null,
    userEmail: actor?.email ?? null,
    userRole: actor?.role ?? null,
    districtId: actor?.districtId ?? null,
    districtName: actor?.districtName ?? null,
  };
}

/** Fire-and-forget: never throws, never awaited by callers. */
export async function logAuditStep(record: AuditStepRecord, req?: Request): Promise<void> {
  const args = clip(record.args, MAX_ARGS);
  const result = clip(record.result, MAX_RESULT);

  await Promise.allSettled([
    prisma.agentAuditLog
      .create({
        data: {
          runId: record.runId,
          eventType: "step",
          question: record.question,
          tool: record.tool,
          args,
          result,
          status: record.status,
          rowCount: rowsIn(record.result),
          durationMs: record.durationMs ?? null,
          ...actorFields(record.actor),
        },
      })
      .catch((e: Error) => console.warn("audit step write failed:", e.message)),
    writeCatalystStep(record, args, result, req),
  ]);
}

async function writeCatalystStep(record: AuditStepRecord, args: string | null, result: string | null, req?: Request) {
  const app = getCatalystApp(req);
  if (!app) return logLocal({ eventType: "step", ...record });
  try {
    await withCatalystTimeout(
      app.datastore().table(AUDIT_TABLE).insertRow({
        RunId: record.runId,
        EventType: "step",
        Question: record.question,
        Tool: record.tool,
        Args: args ?? "",
        Result: result ?? "",
        Status: record.status,
      })
    );
  } catch (e) {
    console.warn("Catalyst audit-log step write failed:", (e as Error).message);
  }
}

/** Fire-and-forget: never throws, never awaited by callers. */
export async function logAuditRun(record: AuditRunRecord, req?: Request): Promise<void> {
  const finalAnswer = clip(record.finalAnswer, MAX_ANSWER);

  await Promise.allSettled([
    prisma.agentAuditLog
      .create({
        data: {
          runId: record.runId,
          eventType: "run",
          question: record.question,
          toolCallCount: record.toolCallCount,
          finalAnswer,
          durationMs: record.durationMs ?? null,
          ...actorFields(record.actor),
          ...groundednessFields(record.groundedness),
        },
      })
      .catch((e: Error) => console.warn("audit run write failed:", e.message)),
    writeCatalystRun(record, finalAnswer, req),
  ]);
}

async function writeCatalystRun(record: AuditRunRecord, finalAnswer: string | null, req?: Request) {
  const app = getCatalystApp(req);
  if (!app) return logLocal({ eventType: "run", ...record });
  try {
    await withCatalystTimeout(
      app.datastore().table(AUDIT_TABLE).insertRow({
        RunId: record.runId,
        EventType: "run",
        Question: record.question,
        ToolCallCount: record.toolCallCount,
        FinalAnswer: finalAnswer ?? "",
        Status: groundednessFields(record.groundedness).status ?? "",
      })
    );
  } catch (e) {
    console.warn("Catalyst audit-log run write failed:", (e as Error).message);
  }
}
