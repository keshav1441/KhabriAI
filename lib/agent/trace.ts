import type { GroundednessVerdict } from "../groundedness";

/**
 * The working behind one answer. Every field already existed somewhere inside a
 * run - in a tool result, in the run loop's timing, in the officer's scope - and
 * none of it reached the officer. This is the shape that carries it out, and it
 * is assembled by a pure function so the assembly can be tested without a DB.
 */

export type TraceTool = {
  tool: string;
  status: "ok" | "error";
  durationMs: number;
  /** The tool's own message when it failed - a failed step is shown, never dropped. */
  error?: string;
};

export type TraceExample = { question: string; score: number };

export type TraceSubstitution = { column: string; from: string; to: string };

export type AnswerTrace = {
  tools: TraceTool[];
  /** Absent when no SQL ran - a similar-case or forecast answer has no query. */
  sql?: string;
  repaired?: boolean;
  /** The database error the repaired query was written to fix. */
  repairError?: string;
  rowCount: number;
  examples: TraceExample[];
  substitutions: TraceSubstitution[];
  /** Null district means the officer sees the whole state. */
  scope: { districtName: string | null };
  totalMs: number;
  /** Only known after the narrative exists, so it is folded in later. */
  groundedness?: GroundednessVerdict;
};

/** One executed tool call, as the run loop already records it. */
export type TraceCall = {
  tool: string;
  status: "ok" | "error";
  durationMs: number;
  result: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function rowsOf(value: unknown): unknown[] | null {
  const r = asRecord(value);
  return Array.isArray(r?.rows) ? (r.rows as unknown[]) : null;
}

export function buildTrace(input: {
  calls: TraceCall[];
  scope: { districtName: string | null };
  totalMs: number;
  groundedness?: GroundednessVerdict;
}): AnswerTrace {
  const { calls, scope, totalMs, groundedness } = input;

  // The last queryDatabase call is the one whose SQL produced the table on
  // screen; earlier ones in a multi-part question were sub-questions.
  const query = asRecord([...calls].reverse().find((c) => c.tool === "queryDatabase")?.result);

  // Not every answer comes from SQL: a crew dossier or a similar-case search
  // returns the rows instead, and the row count should still be honest.
  const rows = rowsOf(query) ?? [...calls].reverse().map((c) => rowsOf(c.result)).find(Boolean) ?? [];

  return {
    tools: calls.map((c) => {
      const message = asRecord(c.result)?.message;
      return {
        tool: c.tool,
        status: c.status,
        durationMs: c.durationMs,
        ...(c.status === "error" && typeof message === "string" ? { error: message } : {}),
      };
    }),
    ...(typeof query?.sql === "string" && query.sql ? { sql: query.sql } : {}),
    ...(query?.repaired === true ? { repaired: true } : {}),
    ...(typeof query?.repairError === "string" ? { repairError: query.repairError } : {}),
    rowCount: rows.length,
    examples: Array.isArray(query?.fewShot) ? (query.fewShot as TraceExample[]) : [],
    substitutions: Array.isArray(query?.substitutions) ? (query.substitutions as TraceSubstitution[]) : [],
    scope: { districtName: scope.districtName ?? null },
    totalMs,
    ...(groundedness ? { groundedness } : {}),
  };
}
