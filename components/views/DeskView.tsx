"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "@/store/chat";
import { t, tv, type StringKey } from "@/lib/i18n";
import { STATUS_STYLE, STALE_ACTION_DAYS } from "@/lib/caseStatus";
import { CaseDrawer } from "../viz/CaseDrawer";
// Type-only: lib/pendency imports Prisma types, which must never reach the bundle.
import type { PendencyFilter, PendencyRow, PendencySummary } from "@/lib/pendency";
import type { CustodyFilter, CustodyPosition, CustodyRow, CustodySummary } from "@/lib/custody";

const FILTERS: { id: PendencyFilter; key: StringKey }[] = [
  { id: "all", key: "desk.filter.all" },
  { id: "overdue", key: "desk.filter.overdue" },
  { id: "noArrest", key: "desk.filter.noArrest" },
];

/** The custody states, as their own chips beside the pendency ones. They read
 *  from a wider set than the desk: a charge-sheeted case is off the pendency
 *  list but is exactly what `csNoCustody` exists to surface. */
const CUSTODY_FILTERS: { id: Exclude<CustodyFilter, "all">; key: StringKey }[] = [
  { id: "none", key: "custody.none" },
  { id: "csNoCustody", key: "custody.csNoCustody" },
  { id: "stale", key: "custody.stale" },
];

type DeskFilter = PendencyFilter | Exclude<CustodyFilter, "all">;

function isCustodyFilter(f: DeskFilter): f is Exclude<CustodyFilter, "all"> {
  return CUSTODY_FILTERS.some((c) => c.id === f);
}

/** What a row needs to render. A pendency row satisfies it as it stands; a
 *  custody row is widened into it, minus the risk score — the risk model knows
 *  nothing about custody and should not be faked for these rows. */
interface DeskItem {
  caseId: number;
  crimeNo: string | null;
  crimeGroup: string;
  station: string;
  status: string;
  daysSinceFir: number;
  hasArrest: boolean;
  arrestCount: number;
  court: string | null;
  clock: PendencyRow["clock"];
  risk?: PendencyRow["risk"];
}

function custodyToItem(r: CustodyRow): DeskItem {
  return {
    caseId: r.caseId,
    crimeNo: r.crimeNo,
    crimeGroup: r.crimeGroup,
    station: r.station,
    status: r.status,
    daysSinceFir: r.daysSinceFir,
    // "Brought in" is all the record supports — see the caveat under the header.
    hasArrest: r.custody.actions > 0,
    arrestCount: r.custody.actions,
    court: null,
    clock: r.clock,
  };
}

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
  const [rows, setRows] = useState<DeskItem[]>([]);
  const [summary, setSummary] = useState<PendencySummary | null>(null);
  const [custodySummary, setCustodySummary] = useState<CustodySummary | null>(null);
  const [custodyById, setCustodyById] = useState<Record<number, CustodyPosition>>({});
  const [filter, setFilter] = useState<DeskFilter>("all");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Chips can be clicked faster than the desk answers, and a stale pair landing
  // late would repaint the previous filter's rows and drop the skeleton early.
  const loadSeq = useRef(0);

  // Both endpoints on every load: the strip keeps counting the whole desk and
  // the whole custody set whichever chip is on, and the custody column is there
  // for pendency rows too. The custody call asks for more rows than the desk
  // shows so the by-case lookup covers the page being rendered.
  const load = useCallback((f: DeskFilter) => {
    const seq = ++loadSeq.current;
    setLoading(true);
    const custodyFilter: CustodyFilter = isCustodyFilter(f) ? f : "all";
    const pendencyFilter: PendencyFilter = isCustodyFilter(f) ? "all" : f;
    Promise.all([
      fetch(`/api/pendency?filter=${pendencyFilter}&limit=200`).then((r) => r.json()).catch(() => null),
      fetch(`/api/custody?filter=${custodyFilter}&limit=500`).then((r) => r.json()).catch(() => null),
    ])
      .then(([desk, custody]) => {
        if (seq !== loadSeq.current) return; // a later chip already superseded this
        const custodyRows: CustodyRow[] = custody?.rows ?? [];
        setSummary(desk?.summary ?? null);
        setCustodySummary(custody?.summary ?? null);
        if (custodyFilter === "all") {
          setCustodyById(Object.fromEntries(custodyRows.map((r) => [r.caseId, r.custody])));
          setRows(desk?.rows ?? []);
        } else {
          // A custody chip is on: the list is the custody set, which includes
          // charge-sheeted cases the pendency desk deliberately drops.
          setCustodyById(Object.fromEntries(custodyRows.map((r) => [r.caseId, r.custody])));
          setRows(custodyRows.slice(0, 200).map(custodyToItem));
        }
        setLoading(false);
      })
      .catch(() => { if (seq === loadSeq.current) setLoading(false); });
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  return (
    <div className="flex flex-col h-full">
      {/* Header + filter chips */}
      <div className="shrink-0 px-6 pt-4 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{t("desk.title", lang)}</h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{t("desk.subtitle", lang)}</p>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
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

          <span className="font-data text-[10px] tracking-widest uppercase pl-1" style={{ color: "var(--text-muted)" }}>
            {t("custody.filter", lang)}
          </span>
          {CUSTODY_FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className="font-data text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded transition-all"
                style={{
                  color: on ? "var(--amber)" : "var(--text-muted)",
                  background: on ? "var(--amber-dim)" : "transparent",
                  border: `1px solid ${on ? "var(--amber)" : "var(--border)"}`,
                }}
              >
                {f.id === "stale" ? `${t(f.key, lang)} ${STALE_ACTION_DAYS}d` : t(f.key, lang)}
              </button>
            );
          })}
        </div>

        {/* Said once, for the whole screen: this column is not a bail position. */}
        <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>{t("custody.caveat", lang)}</p>
      </div>

      {/* Summary strip — always the whole desk, even while a filter is on */}
      <div className="shrink-0 grid grid-cols-6 gap-px px-6 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <Stat label={t("desk.openCases", lang)} value={summary?.openCases} loading={loading && !summary} />
        <Stat label={t("desk.csOverdue", lang)} value={summary?.overdue} loading={loading && !summary} color="var(--red)" />
        <Stat label={t("desk.noArrest", lang)} value={summary?.noArrest} loading={loading && !summary} color="var(--amber)" />
        <Stat label={`Median ${t("desk.age", lang).toLowerCase()}`} value={summary?.medianAgeDays ?? undefined} loading={loading && !summary} />
        {/* Counted over every live case in scope, charge-sheeted ones included,
            so these two do not match the open-case counts beside them. */}
        <Stat label={t("custody.none", lang)} value={custodySummary?.noneBroughtIn} loading={loading && !custodySummary} color="var(--amber)" />
        <Stat label={t("custody.csNoCustody", lang)} value={custodySummary?.csNoCustody} loading={loading && !custodySummary} color="var(--red)" />
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
          rows.map((c) => (
            <DeskRow key={c.caseId} c={c} custody={custodyById[c.caseId]} lang={lang} onOpen={() => setSelectedId(c.caseId)} />
          ))
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

function DeskRow({ c, custody, lang, onOpen }: { c: DeskItem; custody?: CustodyPosition; lang: "en" | "kn"; onOpen: () => void }) {
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
            {tv(c.status, lang)}
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

        {/* Custody position: how much of the accused roll has ever been brought
            in. Arrest and surrender are not separated because the record cannot
            tell them apart — the caveat under the header says so. */}
        {custody && <CustodyChips custody={custody} daysSinceFir={c.daysSinceFir} lang={lang} />}

        {/* Court — the schema records no hearing date, so none is shown */}
        {c.court && <Chip label={`${t("desk.court", lang)}: ${c.court}`} color="var(--text-secondary)" bg="var(--bg-raised)" />}

        {/* Risk, with what the number means. Absent on custody-filtered rows:
            the chargesheet model does not score charge-sheeted cases. */}
        {c.risk && (
          <Chip
            label={`${t("desk.risk", lang)} ${Math.round(c.risk.probability * 100)}%`}
            sub={c.risk.label}
            color={riskColor(c.risk.probability)}
            bg="var(--bg-raised)"
          />
        )}
      </div>
    </div>
  );
}

/**
 * The custody column for one case: the roll, then whatever is worth an
 * officer's attention about it. "0 accused recorded" is shown as itself rather
 * than as "nobody brought in" — nobody named and nobody held are different
 * failures and must not read the same.
 */
function CustodyChips({ custody, daysSinceFir, lang }: { custody: CustodyPosition; daysSinceFir: number; lang: "en" | "kn" }) {
  const { accusedCount, broughtIn, lastActionDate, daysSinceLastAction, flags } = custody;
  const color = accusedCount === 0 ? "var(--text-muted)" : broughtIn === 0 ? "var(--amber)" : broughtIn < accusedCount ? "var(--amber)" : "var(--green)";
  const bg = accusedCount === 0 ? "var(--bg-raised)" : broughtIn === 0 || broughtIn < accusedCount ? "var(--amber-dim)" : "var(--green-dim)";

  return (
    <>
      <Chip
        label={accusedCount === 0 ? "—" : broughtIn === 0 ? t("custody.none", lang) : `${broughtIn}/${accusedCount}`}
        sub={accusedCount === 0 ? "no accused recorded" : t("custody.title", lang).toLowerCase()}
        color={color}
        bg={bg}
      />
      {lastActionDate && (
        <Chip label={lastActionDate} sub={`${daysSinceLastAction}d`} color="var(--text-secondary)" bg="var(--bg-raised)" />
      )}
      {flags.includes("csNoCustody") && (
        <Chip label={t("custody.csNoCustody", lang)} color="var(--red)" bg="var(--red-dim)" />
      )}
      {flags.includes("stale") && (
        <Chip label={t("custody.stale", lang)} sub={`${daysSinceLastAction ?? daysSinceFir}d`} color="var(--amber)" bg="var(--amber-dim)" />
      )}
    </>
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
