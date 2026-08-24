"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useChatStore } from "@/store/chat";
import { t, type StringKey } from "@/lib/i18n";
import { CaseDrawer } from "../viz/CaseDrawer";
// Type-only: lib/pipeline imports the Prisma Db type, which must never reach the bundle.
import type { Pipeline, PipelineBreakdown, PipelineStage, SlowCase } from "@/lib/pipeline";

type Dimension = "district" | "crimeGroup";

const WINDOWS = [6, 12, 24];

/** The funnel narrows, so the colour warms as fewer cases survive each step. */
const STAGE_COLOR: Record<string, string> = {
  registered: "var(--blue)",
  arrested: "var(--amber)",
  chargesheet: "var(--green)",
  court: "var(--text-muted)",
};

const TIP_STYLE = {
  backgroundColor: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text-primary)",
  fontSize: 12,
};

const days = (n: number | null) => (n === null ? "—" : `${n.toLocaleString()}d`);

/**
 * FIR → arrest → chargesheet → court, as a funnel.
 *
 * The dashboard's other screens count crime; this one counts movement. Each bar
 * is how many cases reached that stage, the connector between two bars is the
 * median days the step took, and the drop-off is what never arrived. The court
 * bar is deliberately empty: the schema has no court date, and lib/pipeline.ts
 * refuses to invent one — the stage is drawn greyed with its reason attached so
 * the gap in the data is visible rather than quietly missing.
 */
export function PipelineView() {
  const lang = useChatStore((s) => s.lang);
  const [data, setData] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(24);
  const [district, setDistrict] = useState("");
  const [crimeGroup, setCrimeGroup] = useState("");
  const [dimension, setDimension] = useState<Dimension>("district");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // The filter dropdowns are populated from the FIRST unfiltered load. Refilling
  // them from a filtered response would leave one option in each list and trap
  // the user inside their own filter.
  const [options, setOptions] = useState<{ districts: string[]; crimeGroups: string[] }>({ districts: [], crimeGroups: [] });
  // Three filters feed the same endpoint, so a slower earlier request can land
  // after a faster later one and paint a pipeline nobody asked for.
  const loadSeq = useRef(0);

  const load = useCallback(() => {
    const seq = ++loadSeq.current;
    setLoading(true);
    const qs = new URLSearchParams({ months: String(months) });
    if (district) qs.set("district", district);
    if (crimeGroup) qs.set("crimeGroup", crimeGroup);
    fetch(`/api/pipeline?${qs}`)
      .then((r) => r.json())
      .then((d: Pipeline) => {
        if (seq !== loadSeq.current) return; // a later filter already superseded this
        setData(d);
        setOptions((prev) =>
          prev.districts.length || district || crimeGroup
            ? prev
            : {
                districts: (d.byDistrict ?? []).map((b) => b.key).sort(),
                crimeGroups: (d.byCrimeGroup ?? []).map((b) => b.key).sort(),
              }
        );
        setLoading(false);
      })
      .catch(() => { if (seq === loadSeq.current) setLoading(false); });
  }, [months, district, crimeGroup]);

  useEffect(() => { load(); }, [load]);

  const stages = data?.stages ?? [];
  const total = data?.totalCases ?? 0;
  const breakdown: PipelineBreakdown[] = (dimension === "district" ? data?.byDistrict : data?.byCrimeGroup) ?? [];

  const chartData = useMemo(
    () =>
      breakdown
        .filter((b) => b.medianToChargesheet !== null)
        .slice(0, 12)
        .map((b) => ({ name: b.key.length > 14 ? `${b.key.slice(0, 13)}…` : b.key, value: b.medianToChargesheet as number, drop: b.chargesheetDropOffPct })),
    [breakdown]
  );

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header + filters */}
      <div className="shrink-0 px-6 pt-4 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{t("pipeline.title", lang)}</h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{t("pipeline.subtitle", lang)}</p>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          {WINDOWS.map((m) => {
            const on = months === m;
            return (
              <button
                key={m}
                onClick={() => setMonths(m)}
                className="font-data text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded transition-all"
                style={{
                  color: on ? "var(--red)" : "var(--text-muted)",
                  background: on ? "var(--red-dim)" : "transparent",
                  border: `1px solid ${on ? "var(--red)" : "var(--border)"}`,
                }}
              >
                {`${m}M`}
              </button>
            );
          })}
          <Select value={district} onChange={setDistrict} placeholder="All districts" options={options.districts} />
          <Select value={crimeGroup} onChange={setCrimeGroup} placeholder="All crime groups" options={options.crimeGroups} />
          <span className="font-data text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
            {loading ? "…" : `${total.toLocaleString()} cases`}
          </span>
        </div>
      </div>

      {loading && !data ? (
        <div className="px-6 py-6 flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="h-10 rounded animate-pulse" style={{ background: "var(--bg-raised)", animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="flex items-center justify-center h-40">
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>{t("pipeline.empty", lang)}</span>
        </div>
      ) : (
        <>
          {/* The finding, before the chart that supports it */}
          {data?.bottleneck && (
            <div className="mx-6 mt-4 px-4 py-3 rounded-md" style={{ background: "var(--red-dim)", border: "1px solid var(--red)" }}>
              <div className="font-data text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--red)" }}>
                {t("pipeline.bottleneck", lang)}
              </div>
              <div className="text-sm mt-1" style={{ color: "var(--text-primary)" }}>
                {t(stageKey(data.bottleneck.fromStage), lang)} → {t(stageKey(data.bottleneck.stage), lang)}
                <span className="font-data font-bold ml-2" style={{ color: "var(--red)" }}>
                  {data.bottleneck.medianDays.toLocaleString()}
                </span>
                <span className="text-xs ml-1" style={{ color: "var(--text-secondary)" }}>{t("pipeline.medianDays", lang)}</span>
                <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>
                  ({data.bottleneck.reached.toLocaleString()} cases)
                </span>
              </div>
            </div>
          )}

          {/* Funnel */}
          <div className="px-6 py-5 flex flex-col">
            {stages.map((s, i) => (
              <StageRow key={s.id} stage={s} total={total} lang={lang} isLast={i === stages.length - 1} />
            ))}
          </div>

          {/* Breakdown */}
          <div className="px-6 pb-2 flex items-center gap-2" style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            {(["district", "crimeGroup"] as Dimension[]).map((d) => {
              const on = dimension === d;
              return (
                <button
                  key={d}
                  onClick={() => setDimension(d)}
                  className="font-data text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded transition-all"
                  style={{
                    color: on ? "var(--red)" : "var(--text-muted)",
                    background: on ? "var(--red-dim)" : "transparent",
                    border: `1px solid ${on ? "var(--red)" : "var(--border)"}`,
                  }}
                >
                  {d === "district" ? "By district" : "By crime group"}
                </button>
              );
            })}
          </div>

          {chartData.length > 1 && (
            <div className="px-4 pb-2" style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 40, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={TIP_STYLE}
                    labelStyle={{ color: "var(--text-secondary)" }}
                    formatter={(v, _n, p) => [`${Number(v)} days · ${(p?.payload as { drop?: number })?.drop ?? 0}% never charge-sheeted`, "Median FIR → chargesheet"]}
                  />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {chartData.map((d, i) => (
                      // Red where the drop-off is worst — a short bar with an 85%
                      // drop-off is fast only for the few cases that survived it.
                      <Cell key={i} fill={d.drop >= 80 ? "#E63946" : d.drop >= 60 ? "#F0A500" : "#2DCA6F"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <BreakdownTable rows={breakdown} lang={lang} />

          {/* The slowest individual files at the bottleneck step — clicking one
              opens the same CaseDrawer the reports and desk screens use. */}
          {data?.slowest?.length ? (
            <SlowestList rows={data.slowest} onSelect={setSelectedId} />
          ) : null}

          {data?.method && (
            <p className="px-6 py-4 text-xs leading-relaxed" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
              {data.method}
            </p>
          )}
        </>
      )}

      <CaseDrawer caseId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function stageKey(id: string): StringKey {
  return `pipeline.${id}` as StringKey;
}

/** One funnel bar plus the connector describing the step that led into it. */
function StageRow({ stage, total, lang, isLast }: { stage: PipelineStage; total: number; lang: "en" | "kn"; isLast: boolean }) {
  const reached = stage.reached;
  const width = reached === null || total === 0 ? 0 : Math.max(2, (reached / total) * 100);
  const color = STAGE_COLOR[stage.id] ?? "var(--blue)";

  return (
    <div>
      {stage.fromStage && (
        <div className="flex items-center gap-2 pl-4 py-1.5" style={{ borderLeft: "2px dashed var(--border)" }}>
          <span className="font-data text-xs font-bold" style={{ color: stage.medianTransitionDays === null ? "var(--text-muted)" : "var(--text-primary)" }}>
            {days(stage.medianTransitionDays)}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{t("pipeline.medianDays", lang)}</span>
          {stage.p90TransitionDays !== null && (
            <span className="font-data text-[10px]" style={{ color: "var(--text-muted)" }}>{`p90 ${stage.p90TransitionDays}d`}</span>
          )}
          {stage.excludedNegative > 0 && (
            <span className="font-data text-[10px]" style={{ color: "var(--amber)" }} title="Milestone dated before the one it follows — excluded from the median rather than clamped to zero.">
              {`${stage.excludedNegative} bad dates excluded`}
            </span>
          )}
        </div>
      )}

      <div className="py-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-bold" style={{ color: stage.measured ? "var(--text-primary)" : "var(--text-muted)" }}>
            {t(stageKey(stage.id), lang)}
          </span>
          <span className="font-data text-xs" style={{ color: "var(--text-secondary)" }}>
            {reached === null ? "—" : reached.toLocaleString()}
          </span>
          {stage.dropOff !== null && stage.dropOff > 0 && (
            <span className="font-data text-[10px] ml-auto" style={{ color: "var(--red)" }}>
              {`${t("pipeline.dropoff", lang)}: ${stage.dropOff.toLocaleString()} (${stage.dropOffPct}%)`}
            </span>
          )}
        </div>
        <div className="mt-1 h-7 rounded-sm overflow-hidden" style={{ background: "var(--bg-raised)" }}>
          <div
            className="h-full rounded-sm transition-all"
            style={{
              width: `${width}%`,
              background: color,
              opacity: stage.measured ? 0.85 : 0.25,
              border: stage.measured ? "none" : "1px dashed var(--border)",
            }}
          />
        </div>
        {!stage.measured && stage.note && (
          <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>{stage.note}</p>
        )}
      </div>

      {!isLast && <div className="h-1" />}
    </div>
  );
}

function BreakdownTable({ rows, lang }: { rows: PipelineBreakdown[]; lang: "en" | "kn" }) {
  if (rows.length === 0) return null;
  const headers = ["", "Cases", t("pipeline.arrested", lang), t("pipeline.chargesheet", lang), "FIR→arrest", "FIR→chargesheet", t("pipeline.dropoff", lang)];

  return (
    <div className="px-2 pb-4 overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr style={{ background: "var(--bg-raised)" }}>
            {headers.map((h, i) => (
              <th
                key={i}
                className={`px-4 py-2.5 font-data font-bold tracking-widest uppercase ${i === 0 ? "text-left" : "text-right"}`}
                style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)", fontSize: "0.6rem", whiteSpace: "nowrap" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} style={{ borderBottom: "1px solid var(--border-subtle)", background: i % 2 === 0 ? "transparent" : "var(--bg-surface)" }}>
              <td className="px-4 py-2 truncate" style={{ color: "var(--text-primary)", maxWidth: 200 }}>{r.key}</td>
              <td className="px-4 py-2 text-right font-data" style={{ color: "var(--text-secondary)" }}>{r.total.toLocaleString()}</td>
              <td className="px-4 py-2 text-right font-data" style={{ color: "var(--text-secondary)" }}>{r.reachedArrest.toLocaleString()}</td>
              <td className="px-4 py-2 text-right font-data" style={{ color: "var(--text-secondary)" }}>{r.reachedChargesheet.toLocaleString()}</td>
              <td className="px-4 py-2 text-right font-data" style={{ color: "var(--text-secondary)" }}>{days(r.medianToArrest)}</td>
              <td className="px-4 py-2 text-right font-data" style={{ color: "var(--text-primary)" }}>{days(r.medianToChargesheet)}</td>
              <td className="px-4 py-2 text-right font-data font-bold" style={{ color: r.chargesheetDropOffPct >= 80 ? "var(--red)" : "var(--amber)" }}>
                {`${r.chargesheetDropOffPct}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SlowestList({ rows, onSelect }: { rows: SlowCase[]; onSelect: (id: number) => void }) {
  return (
    <div className="px-6 pb-5">
      <div className="font-data text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: "var(--text-muted)" }}>
        Longest at the slowest step
      </div>
      <div className="flex flex-col gap-px">
        {rows.map((c) => (
          <button
            key={c.caseId}
            onClick={() => onSelect(c.caseId)}
            className="flex items-center gap-3 px-3 py-2 text-left text-xs rounded transition-all"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-raised)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)"; }}
          >
            <span className="font-data font-bold" style={{ color: "var(--red)", minWidth: 56 }}>{`${c.days}d`}</span>
            <span className="truncate" style={{ color: "var(--text-primary)", maxWidth: 200 }}>{c.crimeGroup}</span>
            <span style={{ color: "var(--text-secondary)" }}>{c.district}</span>
            <span className="font-data ml-auto" style={{ color: "var(--text-muted)" }}>{c.firDate}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Select({ value, onChange, placeholder, options }: { value: string; onChange: (v: string) => void; placeholder: string; options: string[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs rounded-md px-2 py-1 outline-none"
      style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
