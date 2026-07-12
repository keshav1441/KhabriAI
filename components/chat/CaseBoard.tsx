"use client";
import { useChatStore, type CaseBoardStep } from "@/store/chat";

const TOOL_LABELS: Record<string, string> = {
  queryDatabase: "Query Database",
  searchRelatedCases: "Search Related Cases",
  checkInsights: "Check Insights",
  getNetworkOrMapData: "Network / Map Data",
};

function statusColor(status: CaseBoardStep["status"]) {
  if (status === "ok") return "var(--green)";
  if (status === "error") return "var(--red)";
  return "var(--amber)";
}

function statusDim(status: CaseBoardStep["status"]) {
  if (status === "ok") return "var(--green-dim)";
  if (status === "error") return "var(--red-dim)";
  return "var(--amber-dim)";
}

function argsSummary(step: CaseBoardStep): string {
  const a = step.args as Record<string, unknown>;
  if (typeof a?.question === "string") return a.question;
  if (typeof a?.query === "string") return a.query;
  if (typeof a?.kind === "string") return `kind: ${a.kind}`;
  return "";
}

function resultSummary(step: CaseBoardStep): string {
  if (step.status === "pending") return "Running…";
  const r = step.result as Record<string, unknown> | null;
  if (!r) return "";
  if (r.status === "error") return (r.message as string) ?? "Failed";
  switch (step.tool) {
    case "queryDatabase": {
      const rows = r.rows as unknown[] | undefined;
      return `${rows?.length ?? 0} row(s)`;
    }
    case "searchRelatedCases": {
      const cases = r.cases as unknown[] | undefined;
      return `${cases?.length ?? 0} related case(s)`;
    }
    case "checkInsights": {
      const insights = r.insights as unknown[] | undefined;
      return `${insights?.length ?? 0} insight(s)`;
    }
    case "getNetworkOrMapData": {
      const rows = r.rows as unknown[] | undefined;
      return `${rows?.length ?? 0} row(s)`;
    }
    default:
      return "Done";
  }
}

function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2l1.5 5.5L19 9l-4 3.5.5 6-3.5-3-3.5 3 .5-6L5 9l5.5-1.5L12 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CaseBoard() {
  const steps = useChatStore((s) => s.caseBoardSteps);

  return (
    <aside
      className="hidden lg:flex flex-col shrink-0 w-[300px] min-h-0"
      style={{ borderLeft: "1px solid var(--border)", background: "var(--bg-surface)" }}
    >
      <div
        className="shrink-0 flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <PinIcon />
        <span
          className="font-data text-xs font-bold tracking-widest uppercase"
          style={{ color: "var(--text-secondary)" }}
        >
          Case Board
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2">
        {steps.length === 0 && (
          <p className="text-xs font-data px-1" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
            Reasoning steps will pin here as the agent investigates.
          </p>
        )}

        {steps.map((step) => (
          <div
            key={step.id}
            className="rounded-md px-3 py-2.5 animate-fade-up"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
              borderLeftColor: statusColor(step.status),
              borderLeftWidth: "3px",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-data text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                {TOOL_LABELS[step.tool] ?? step.tool}
              </span>
              <span
                className="text-[10px] font-data font-bold uppercase px-1.5 py-0.5 rounded"
                style={{ color: statusColor(step.status), background: statusDim(step.status) }}
              >
                {step.status === "pending" ? "Running" : step.status === "ok" ? "Done" : "Failed"}
              </span>
            </div>
            {argsSummary(step) && (
              <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                {argsSummary(step)}
              </p>
            )}
            <p className="text-xs font-data mt-1" style={{ color: "var(--text-muted)" }}>
              {resultSummary(step)}
            </p>
          </div>
        ))}
      </div>
    </aside>
  );
}
