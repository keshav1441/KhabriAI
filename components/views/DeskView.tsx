"use client";
import { useCallback, useEffect, useState } from "react";
import { useChatStore } from "@/store/chat";
import { t, type StringKey } from "@/lib/i18n";
import { STATUS_STYLE } from "@/lib/caseStatus";
import { CaseDrawer } from "../viz/CaseDrawer";
// Type-only: lib/pendency imports Prisma types, which must never reach the bundle.
import type { PendencyFilter, PendencyRow, PendencySummary } from "@/lib/pendency";

const FILTERS: { id: PendencyFilter; key: StringKey }[] = [
  { id: "all", key: "desk.filter.all" },
  { id: "overdue", key: "desk.filter.overdue" },
  { id: "noArrest", key: "desk.filter.noArrest" },
];

/** Overdue is red, due-soon is amber, everything else stays quiet — the desk
 *  should be readable from across the room without reading a number. */
const CLOCK_STYLE: Record<PendencyRow["clock"]["state"], { color: string; bg: string }> = {
  overdue: { color: "var(--red)", bg: "var(--red-dim)" },
  dueSoon: { color: "var(--amber)", bg: "var(--amber-dim)" },
  onTrack: { color: "var(--text-muted)", bg: "var(--bg-raised)" },
};

function riskColor(p: number) {
  return p >= 0.5 ? "var(--green)" : p >= 0.25 ? "var(--amber)" : "var(--red)";
}

/**
 * "My Desk" — pendency, ranked by the statutory chargesheet clock. The API
 * already returns the rows in attention order; re-sorting here would quietly
 * disagree with the rule lib/pendency.ts documents.
 */
export function DeskView() {
  const lang = useChatStore((s) => s.lang);
  const [rows, setRows] = useState<PendencyRow[]>([]);
  const [summary, setSummary] = useState<PendencySummary | null>(null);
  const [filter, setFilter] = useState<PendencyFilter>("all");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback((f: PendencyFilter) => {
    setLoading(true);
    fetch(`/api/pendency?filter=${f}&limit=200`)
      .then((r) => r.json())
      .then((d) => { setRows(d.rows ?? []); setSummary(d.summary ?? null); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  return (
    <div className="flex flex-col h-full">
      {/* Header + filter chips */}
      <div className="shrink-0 px-6 pt-4 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{t("desk.title", lang)}</h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{t("desk.subtitle", lang)}</p>

        <div className="flex items-center gap-2 mt-3">
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className="font-data text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded transition-all"
                style={{
                  color: on ? "var(--red)" : "var(--text-muted)",
                  background: on ? "var(--red-dim)" : "transparent",
                  border: `1px solid ${on ? "var(--red)" : "var(--border)"}`,
                }}
              >
                {t(f.key, lang)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary strip — always the whole desk, even while a filter is on */}
      <div className="shrink-0 grid grid-cols-4 gap-px px-6 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <Stat label="Open cases" value={summary?.openCases} loading={loading && !summary} />
        <Stat label={t("desk.csOverdue", lang)} value={summary?.overdue} loading={loading && !summary} color="var(--red)" />
        <Stat label={t("desk.noArrest", lang)} value={summary?.noArrest} loading={loading && !summary} color="var(--amber)" />
        <Stat label={`Median ${t("desk.age", lang).toLowerCase()}`} value={summary?.medianAgeDays ?? undefined} loading={loading && !summary} />
      </div>

      {/* Case list */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-6 flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="h-12 rounded animate-pulse" style={{ background: "var(--bg-raised)", animationDelay: `${i * 40}ms` }} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>{t("desk.empty", lang)}</span>
          </div>
        ) : (
          rows.map((c) => <DeskRow key={c.caseId} c={c} lang={lang} onOpen={() => setSelectedId(c.caseId)} />)
        )}
      </div>

      <CaseDrawer caseId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function Stat({ label, value, loading, color }: { label: string; value?: number; loading: boolean; color?: string }) {
  return (
    <div>
      <div className="font-data text-lg font-bold" style={{ color: color ?? "var(--text-primary)" }}>
        {loading ? <span className="inline-block h-5 w-8 rounded animate-pulse" style={{ background: "var(--bg-raised)" }} /> : value ?? "—"}
      </div>
      <div className="font-data text-[10px] tracking-widest uppercase truncate" style={{ color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

function DeskRow({ c, lang, onOpen }: { c: PendencyRow; lang: "en" | "kn"; onOpen: () => void }) {
  const overdue = c.clock.state === "overdue";
  const clockStyle = CLOCK_STYLE[c.clock.state];
  const status = STATUS_STYLE[c.status];

  return (
    <div
      onClick={onOpen}
      className="px-6 py-3 cursor-pointer transition-colors"
      style={{
        borderBottom: "1px solid var(--border-subtle)",
        // An overdue case carries a red rail down its left edge: the one signal
        // that survives skimming the list at speed.
        borderLeft: `3px solid ${overdue ? "var(--red)" : "transparent"}`,
        background: overdue ? "var(--red-dim)" : "transparent",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-raised)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = overdue ? "var(--red-dim)" : "transparent"; }}
    >
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="font-data text-xs font-bold" style={{ color: "var(--text-primary)" }}>{c.crimeNo || `#${c.caseId}`}</span>
        <span className="text-xs" style={{ color: "var(--text-primary)" }}>{c.crimeGroup}</span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{c.station}</span>
        {status && (
          <span
            className="font-data text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ color: status.color, background: status.bg }}
          >
            {c.status}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-2">
        {/* Age */}
        <Chip label={`${c.daysSinceFir}d`} sub={t("desk.age", lang)} color="var(--text-secondary)" bg="var(--bg-raised)" />

        {/* Arrest state */}
        {c.hasArrest ? (
          <Chip label={`${c.arrestCount} arrest${c.arrestCount === 1 ? "" : "s"}`} color="var(--green)" bg="var(--green-dim)" />
        ) : (
          <Chip label={t("desk.noArrest", lang)} color="var(--amber)" bg="var(--amber-dim)" />
        )}

        {/* Statutory clock, with the limit it was measured against */}
        <Chip
          label={
            overdue
              ? `${t("desk.csOverdue", lang)} · ${c.clock.daysOverdue}d`
              : `${t("desk.csDue", lang)} · ${c.clock.daysRemaining}d`
          }
          sub={`${c.clock.limitDays}d${c.clock.basis === "assumed" ? " (assumed)" : ""}`}
          color={clockStyle.color}
          bg={clockStyle.bg}
        />

        {/* Court — the schema records no hearing date, so none is shown */}
        {c.court && <Chip label={`${t("desk.court", lang)}: ${c.court}`} color="var(--text-secondary)" bg="var(--bg-raised)" />}

        {/* Risk, with what the number means */}
        <Chip
          label={`${t("desk.risk", lang)} ${Math.round(c.risk.probability * 100)}%`}
          sub={c.risk.label}
          color={riskColor(c.risk.probability)}
          bg="var(--bg-raised)"
        />
      </div>
    </div>
  );
}

function Chip({ label, sub, color, bg }: { label: string; sub?: string; color: string; bg: string }) {
  return (
    <span className="font-data text-[10px] px-2 py-0.5 rounded whitespace-nowrap" style={{ color, background: bg }}>
      <span className="font-bold">{label}</span>
      {sub && <span style={{ color: "var(--text-muted)" }}> · {sub}</span>}
    </span>
  );
}
