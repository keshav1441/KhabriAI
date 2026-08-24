import { prisma } from "./db";

/**
 * Reading the audit trail.
 *
 * The unit a reviewer thinks in is a run — one question an officer asked — not
 * an individual tool call, so the list is grouped by run and the tool calls
 * hang under it. Filters are the ones an actual review starts from: who, which
 * tool, what scope, what went wrong, and free text over the question.
 */

export interface AuditStep {
  id: string;
  tool: string | null;
  status: string | null;
  rowCount: number | null;
  durationMs: number | null;
  args: string | null;
  result: string | null;
  createdAt: Date;
}

export interface AuditRun {
  runId: string;
  question: string;
  officer: string | null;
  role: string | null;
  scope: string; // the district the query ran under, or "Statewide"
  toolCallCount: number | null;
  durationMs: number | null;
  finalAnswer: string | null;
  createdAt: Date;
  steps: AuditStep[];
  failed: boolean;
}

export interface AuditFilters {
  officer?: string;
  tool?: string;
  scope?: string;
  status?: "ok" | "error";
  q?: string;
  days?: number;
  limit?: number;
}

/**
 * One row per run, with its steps attached. Runs are found first and their
 * steps fetched by runId, so a filter on a tool still returns the whole run it
 * belonged to — a reviewer needs the question that produced the call, not the
 * call on its own.
 */
export async function listAuditRuns(filters: AuditFilters = {}): Promise<AuditRun[]> {
  const { officer, tool, scope, status, q, days = 30, limit = 50 } = filters;
  const since = new Date(Date.now() - Math.min(Math.max(days, 1), 365) * 24 * 60 * 60 * 1000);

  const stepWhere = {
    eventType: "step",
    createdAt: { gte: since },
    ...(tool ? { tool } : {}),
    ...(status ? { status } : {}),
    ...(officer ? { userEmail: { contains: officer, mode: "insensitive" as const } } : {}),
    ...(q ? { question: { contains: q, mode: "insensitive" as const } } : {}),
    ...(scope ? (scope === "statewide" ? { districtName: null } : { districtName: scope }) : {}),
  };

  // Which runs match. A run qualifies through any of its steps.
  const matching = await prisma.agentAuditLog.findMany({
    where: stepWhere,
    select: { runId: true },
    distinct: ["runId"],
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
  });
  const runIds = matching.map((m) => m.runId);
  if (!runIds.length) return [];

  const rows = await prisma.agentAuditLog.findMany({
    where: { runId: { in: runIds } },
    orderBy: { createdAt: "asc" },
  });

  const byRun = new Map<string, AuditRun>();
  for (const r of rows) {
    let run = byRun.get(r.runId);
    if (!run) {
      run = {
        runId: r.runId,
        question: r.question,
        officer: r.userEmail,
        role: r.userRole,
        scope: r.districtName ?? "Statewide",
        toolCallCount: null,
        durationMs: null,
        finalAnswer: null,
        createdAt: r.createdAt,
        steps: [],
        failed: false,
      };
      byRun.set(r.runId, run);
    }
    if (r.eventType === "run") {
      run.toolCallCount = r.toolCallCount;
      run.durationMs = r.durationMs;
      run.finalAnswer = r.finalAnswer;
    } else {
      run.steps.push({
        id: r.id,
        tool: r.tool,
        status: r.status,
        rowCount: r.rowCount,
        durationMs: r.durationMs,
        args: r.args,
        result: r.result,
        createdAt: r.createdAt,
      });
      if (r.status === "error") run.failed = true;
    }
    // A run that never wrote its closing row still has a question and steps;
    // the earliest row's timestamp is when the officer asked.
    if (r.createdAt < run.createdAt) run.createdAt = r.createdAt;
  }

  return [...byRun.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export interface AuditSummary {
  runs: number;
  toolCalls: number;
  failures: number;
  officers: number;
  medianRunMs: number | null;
  byTool: { tool: string; calls: number; failures: number; medianMs: number | null }[];
  byOfficer: { officer: string; runs: number; scope: string }[];
  /** Distinct scopes seen, so a reviewer can filter to district-bound queries. */
  scopes: string[];
}

export async function auditSummary(days = 30): Promise<AuditSummary> {
  const since = new Date(Date.now() - Math.min(Math.max(days, 1), 365) * 24 * 60 * 60 * 1000);
  const window = { createdAt: { gte: since } };

  const [runs, toolCalls, failures, byTool, byOfficer, scopes, runDurations] = await Promise.all([
    prisma.agentAuditLog.count({ where: { ...window, eventType: "run" } }),
    prisma.agentAuditLog.count({ where: { ...window, eventType: "step" } }),
    prisma.agentAuditLog.count({ where: { ...window, eventType: "step", status: "error" } }),
    prisma.$queryRawUnsafe<{ tool: string; calls: number; failures: number; median_ms: number | null }[]>(
      `SELECT "tool",
              COUNT(*)::int AS calls,
              COUNT(*) FILTER (WHERE "status" = 'error')::int AS failures,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "durationMs") AS median_ms
       FROM "AgentAuditLog"
       WHERE "eventType" = 'step' AND "createdAt" >= $1 AND "tool" IS NOT NULL
       GROUP BY 1 ORDER BY 2 DESC`,
      since
    ),
    prisma.$queryRawUnsafe<{ officer: string; runs: number; scope: string }[]>(
      `SELECT COALESCE("userEmail", 'unattributed') AS officer,
              COUNT(*)::int AS runs,
              COALESCE(MAX("districtName"), 'Statewide') AS scope
       FROM "AgentAuditLog"
       WHERE "eventType" = 'run' AND "createdAt" >= $1
       GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
      since
    ),
    prisma.$queryRawUnsafe<{ scope: string }[]>(
      `SELECT DISTINCT COALESCE("districtName", 'Statewide') AS scope
       FROM "AgentAuditLog" WHERE "createdAt" >= $1 ORDER BY 1`,
      since
    ),
    prisma.$queryRawUnsafe<{ median_ms: number | null }[]>(
      `SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "durationMs") AS median_ms
       FROM "AgentAuditLog" WHERE "eventType" = 'run' AND "createdAt" >= $1 AND "durationMs" IS NOT NULL`,
      since
    ),
  ]);

  const officers = new Set(byOfficer.map((o) => o.officer)).size;
  const round = (n: number | null | undefined) => (n == null ? null : Math.round(Number(n)));

  return {
    runs,
    toolCalls,
    failures,
    officers,
    medianRunMs: round(runDurations[0]?.median_ms),
    byTool: byTool.map((t) => ({
      tool: t.tool,
      calls: Number(t.calls),
      failures: Number(t.failures),
      medianMs: round(t.median_ms),
    })),
    byOfficer: byOfficer.map((o) => ({ officer: o.officer, runs: Number(o.runs), scope: o.scope })),
    scopes: scopes.map((s) => s.scope),
  };
}
