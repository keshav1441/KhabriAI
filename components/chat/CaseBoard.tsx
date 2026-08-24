"use client";
import { useState } from "react";
import { useChatStore, type CaseBoardStep } from "@/store/chat";
import { t, type StringKey } from "@/lib/i18n";

const TOOL_LABEL_KEYS: Record<string, StringKey> = {
  queryDatabase: "board.tool.queryDatabase",
  searchRelatedCases: "board.tool.searchRelatedCases",
  checkInsights: "board.tool.checkInsights",
  getNetworkOrMapData: "board.tool.getNetworkOrMapData",
  predictRisk: "board.tool.predictRisk",
  askClarification: "board.tool.askClarification",
  findSimilarCases: "board.tool.findSimilarCases",
  buildCrewDossier: "board.tool.buildCrewDossier",
};

type Contribution = { label: string; sign: "+" | "-"; strength: number };

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

function resultSummary(step: CaseBoardStep, lang: import("@/store/chat").Lang): string {
  if (step.status === "pending") return `${t("board.statusRunning", lang)}…`;
  const r = step.result as Record<string, unknown> | null;
  if (!r) return "";
  if (r.status === "error") return (r.message as string) ?? t("board.statusFailed", lang);
  switch (step.tool) {
    case "queryDatabase": {
      const rows = r.rows as unknown[] | undefined;
      const fixed = r.repaired ? ` · ${t("board.repaired", lang)}` : "";
      const subs = (r.substitutions as { from: string; to: string }[] | undefined) ?? [];
      const resolved = subs.length ? ` · ${subs.map((s) => `${s.from} \u2192 ${s.to}`).join(", ")}` : "";
      const amb = r.ambiguousPerson as { token: string; count: number } | null | undefined;
      if (amb) return `${amb.count} ${t("board.peopleMatch", lang)} "${amb.token}"`;
      return `${rows?.length ?? 0} ${t("board.rows", lang)}${fixed}${resolved}`;
    }
    case "searchRelatedCases": {
      const cases = r.cases as unknown[] | undefined;
      return `${cases?.length ?? 0} ${t("board.relatedCases", lang)}`;
    }
    case "checkInsights": {
      const insights = r.insights as unknown[] | undefined;
      return `${insights?.length ?? 0} ${t("board.insights", lang)}`;
    }
    case "getNetworkOrMapData": {
      const rows = r.rows as unknown[] | undefined;
      return `${rows?.length ?? 0} ${t("board.rows", lang)}`;
    }
    case "askClarification":
      return t("board.clarify", lang);
    case "findSimilarCases": {
      const cases = r.cases as unknown[] | undefined;
      return `${cases?.length ?? 0} ${t("board.linkedCases", lang)}`;
    }
    case "predictRisk": {
      const prob = typeof r.probability === "number" ? `${Math.round(r.probability * 100)}%` : "—";
      return `${(r.label as string) ?? t("board.prediction", lang)} · ${prob}`;
    }
    default:
      return t("board.statusDone", lang);
  }
}

function contributions(step: CaseBoardStep): Contribution[] {
  const r = step.result as Record<string, unknown> | null;
  const c = r?.contributions;
  return Array.isArray(c) ? (c as Contribution[]) : [];
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

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Detail body shown when a step is expanded — richer than the one-line resultSummary.
function StepDetail({ step }: { step: CaseBoardStep }) {
  const r = step.result as Record<string, unknown> | null;
  if (step.status === "pending") return null;
  if (!r) return null;
  if (r.status === "error") return null; // resultSummary already surfaces the error message

  switch (step.tool) {
    case "searchRelatedCases":
    case "findSimilarCases": {
      const cases = (r.cases as { crimeNo?: string; briefFacts?: string; district?: string; score?: number }[] | undefined) ?? [];
      if (cases.length === 0) return null;
      return (
        <ul className="mt-2 space-y-1.5">
          {cases.map((c, i) => (
            <li key={i} className="text-xs" style={{ color: "var(--text-secondary)" }}>
              <span className="font-data font-bold" style={{ color: "var(--text-primary)" }}>{c.crimeNo ?? `Case ${i + 1}`}</span>
              {c.district ? ` · ${c.district}` : ""}
              {step.tool === "findSimilarCases" && typeof c.score === "number" ? ` · ${Math.round(c.score * 100)}%` : ""}
              {c.briefFacts ? <p className="mt-0.5 line-clamp-3">{c.briefFacts}</p> : null}
            </li>
          ))}
        </ul>
      );
    }
    case "checkInsights": {
      const insights = (r.insights as { title?: string; detail?: string }[] | undefined) ?? [];
      if (insights.length === 0) return null;
      return (
        <ul className="mt-2 space-y-1.5">
          {insights.map((ins, i) => (
            <li key={i} className="text-xs" style={{ color: "var(--text-secondary)" }}>
              <span className="font-data font-bold" style={{ color: "var(--text-primary)" }}>{ins.title}</span>
              {ins.detail ? <p className="mt-0.5">{ins.detail}</p> : null}
            </li>
          ))}
        </ul>
      );
    }
    case "getNetworkOrMapData": {
      const rows = (r.rows as Record<string, unknown>[] | undefined) ?? [];
      if (rows.length === 0) return null;
      return (
        <ul className="mt-2 space-y-1">
          {rows.slice(0, 10).map((row, i) => (
            <li key={i} className="text-xs font-data" style={{ color: "var(--text-secondary)" }}>
              {Object.values(row).join(" · ")}
            </li>
          ))}
          {rows.length > 10 && (
            <li className="text-[10px] font-data" style={{ color: "var(--text-muted)" }}>+{rows.length - 10} more</li>
          )}
        </ul>
      );
    }
    default:
      return null;
  }
}

export function CaseBoard() {
  const steps = useChatStore((s) => s.caseBoardSteps);
  const lang = useChatStore((s) => s.lang);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
          {t("board.title", lang)}
        </span>
      </div>

      <div className={`flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2 ${steps.length > 1 ? "evidence-thread pl-5" : ""}`}>
        {steps.length === 0 && (
          <p className="text-xs font-data px-1" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
            {t("board.empty", lang)}
          </p>
        )}

        {steps.map((step) => {
          const isExpanded = expanded.has(step.id);
          const canExpand =
            step.status !== "pending" &&
            ["searchRelatedCases", "checkInsights", "getNetworkOrMapData", "findSimilarCases"].includes(step.tool);
          return (
          <div
            key={step.id}
            role={canExpand ? "button" : undefined}
            tabIndex={canExpand ? 0 : undefined}
            onClick={canExpand ? () => toggle(step.id) : undefined}
            onKeyDown={
              canExpand
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(step.id);
                    }
                  }
                : undefined
            }
            className="rounded-md px-3 py-2.5 animate-fade-up"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
              borderLeftColor: statusColor(step.status),
              borderLeftWidth: "3px",
              cursor: canExpand ? "pointer" : "default",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-data text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                {TOOL_LABEL_KEYS[step.tool] ? t(TOOL_LABEL_KEYS[step.tool], lang) : step.tool}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  className="text-[10px] font-data font-bold uppercase px-1.5 py-0.5 rounded"
                  style={{ color: statusColor(step.status), background: statusDim(step.status) }}
                >
                  {step.status === "pending" ? t("board.statusRunning", lang) : step.status === "ok" ? t("board.statusDone", lang) : t("board.statusFailed", lang)}
                </span>
                {canExpand && <span style={{ color: "var(--text-muted)" }}><ChevronIcon expanded={isExpanded} /></span>}
              </div>
            </div>
            {argsSummary(step) && (
              <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                {argsSummary(step)}
              </p>
            )}
            <p className="text-xs font-data mt-1" style={{ color: "var(--text-muted)" }}>
              {resultSummary(step, lang)}
            </p>
            {isExpanded && <StepDetail step={step} />}
            {step.tool === "predictRisk" && contributions(step).length > 0 && (
              <div className="mt-2 pt-2 space-y-1" style={{ borderTop: "1px solid var(--border)" }}>
                <p className="text-[10px] font-data font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  {t("board.why", lang)}
                </p>
                {contributions(step).map((c, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs">
                    <span className="font-data font-bold shrink-0" style={{ color: c.sign === "+" ? "var(--green)" : "var(--red)" }}>
                      {c.sign}
                    </span>
                    <span style={{ color: "var(--text-secondary)" }}>{c.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          );
        })}
      </div>
    </aside>
  );
}
