"use client";
import { useCallback, useEffect, useState } from "react";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useChatStore } from "@/store/chat";
import { t } from "@/lib/i18n";
// Type-only: lib/time-patterns imports Prisma types, which must never reach the bundle.
import type { TimePatterns, PatternAxis } from "@/lib/time-patterns";

type PatternsResponse = TimePatterns & { scope?: string | null };

const WINDOWS: { id: string; days: number | null; label: string }[] = [
  { id: "90", days: 90, label: "90 days" },
  { id: "365", days: 365, label: "12 months" },
  { id: "all", days: null, label: "All" },
];

const AXIS_STYLE = { fill: "var(--text-muted)", fontSize: 11 };
const TIP_STYLE = {
  backgroundColor: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text-primary)",
  fontSize: 12,
};

/**
 * The one sentence that decides whether a bar is worth a patrol order. A peak is
 * only ever printed when the API's chi-square test rejected a flat distribution;
 * otherwise this says so in words, because "the tallest bar" and "a pattern" are
 * not the same claim and an officer should not have to know that.
 */
function PeakLine({ axis, label }: { axis: PatternAxis; label: string }) {
  const lang = useChatStore((s) => s.lang);
  const { peak } = axis;

  if (peak.verdict === "peak") {
    const pct = Math.round((peak.lift - 1) * 100);
    return (
      <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1">
        <span className="font-data text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
          {t("patterns.peak", lang)}
        </span>
        <span className="font-data text-sm font-bold" style={{ color: "var(--red)" }}>{axis.peakLabel}</span>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {peak.observed.toLocaleString()} cases against {Math.round(peak.expected).toLocaleString()} expected —{" "}
          {pct > 0 ? "+" : ""}{pct}% on the {label.toLowerCase()} baseline
        </span>
        <span className="font-data text-[10px]" style={{ color: "var(--text-muted)" }}>
          χ²={peak.chi2.toFixed(1)} · df={peak.df} · p&lt;0.05
        </span>
      </div>
    );
  }

  const reason =
    peak.verdict === "insufficient"
      ? "Too few cases in this selection to test — no window is claimed."
      : `No window stands out: the spread across the ${label.toLowerCase()} is within what ordinary variation produces (χ²=${peak.chi2.toFixed(1)}, df=${peak.df}, p=${peak.p.toFixed(2)}). The tallest bar is not a pattern.`;

  return (
    <div className="flex items-baseline flex-wrap gap-x-2">
      <span className="font-data text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
        {t("patterns.peak", lang)}
      </span>
      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{reason}</span>
    </div>
  );
}

function CountBars({ axis, height = 150 }: { axis: PatternAxis; height?: number }) {
  const inPeak = new Set(axis.peak.verdict === "peak" ? axis.peak.window : []);
  const data = axis.labels.map((name, i) => ({ name, value: axis.counts[i], i }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} width={44} />
        <Tooltip contentStyle={TIP_STYLE} labelStyle={{ color: "var(--text-secondary)" }} cursor={{ fill: "var(--bg-raised)" }} />
        <Bar dataKey="value" radius={[2, 2, 0, 0]}>
          {data.map((d) => (
            // Only a window the test actually accepted is coloured. Highlighting
            // the maximum of a flat distribution would be the lie this screen exists to avoid.
            <Cell key={d.i} fill={inPeak.has(d.i) ? "var(--red)" : "var(--khaki)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Day × hour, both axes read off the same instant so a cell means one thing. */
function HeatGrid({ grid, hourLabels, weekdayLabels }: { grid: number[][]; hourLabels: string[]; weekdayLabels: string[] }) {
  const max = Math.max(1, ...grid.flat());

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="flex gap-px pl-8">
          {hourLabels.map((h, i) => (
            <div
              key={h}
              className="font-data text-center"
              style={{ width: 22, fontSize: "0.55rem", color: "var(--text-muted)" }}
            >
              {i % 3 === 0 ? h.slice(0, 2) : ""}
            </div>
          ))}
        </div>
        {grid.map((row, d) => (
          <div key={weekdayLabels[d]} className="flex gap-px items-center mt-px">
            <div
              className="font-data shrink-0 text-right pr-1.5"
              style={{ width: 32, fontSize: "0.6rem", color: "var(--text-muted)" }}
            >
              {weekdayLabels[d]}
            </div>
            {row.map((n, h) => (
              <div
                key={h}
                title={`${weekdayLabels[d]} ${hourLabels[h]} — ${n.toLocaleString()} cases`}
                className="rounded-[2px] relative shrink-0"
                style={{ width: 22, height: 20, background: "var(--bg-raised)" }}
              >
                <div
                  className="absolute inset-0 rounded-[2px]"
                  style={{ background: "var(--red)", opacity: n ? 0.12 + 0.78 * (n / max) : 0 }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <h3 className="font-data text-[11px] font-bold tracking-widest uppercase mb-3" style={{ color: "var(--text-secondary)" }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * "When crime happens" — the hour, weekday and month shape of the caseload,
 * the other half of the hotspot map's "where".
 *
 * The screen refuses to sell a shift plan it cannot support. Hour of day exists
 * only because IncidentFromDate is a timestamp; CrimeRegisteredDate is a DATE
 * column with no clock, and when a corpus turns out to carry no real time of day
 * the hour panel is withheld with the reason printed, not drawn flat and left to
 * be misread. Every peak is gated on the API's chi-square test, and the caveat
 * about FIR timestamps is body text, never a tooltip — a warning nobody hovers
 * over is a warning nobody was given.
 */
export function PatternsView() {
  const lang = useChatStore((s) => s.lang);
  const [data, setData] = useState<PatternsResponse | null>(null);
  const [group, setGroup] = useState("all");
  const [windowId, setWindowId] = useState("365");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback((g: string, w: string) => {
    const days = WINDOWS.find((x) => x.id === w)?.days ?? null;
    setLoading(true);
    setFailed(false);
    fetch(`/api/patterns?group=${encodeURIComponent(g)}${days ? `&days=${days}` : ""}`)
      .then((r) => r.json())
      .then((d: PatternsResponse & { error?: string }) => {
        if (d.error) { setFailed(true); setData(null); }
        else setData(d);
        setLoading(false);
      })
      .catch(() => { setFailed(true); setLoading(false); });
  }, []);

  useEffect(() => { load(group, windowId); }, [group, windowId, load]);

  const groups = ["all", ...(data?.crimeGroups ?? [])];

  return (
    <div className="flex flex-col h-full">
      {/* Header + selectors */}
      <div className="shrink-0 px-6 pt-4 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{t("patterns.title", lang)}</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{t("patterns.subtitle", lang)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {WINDOWS.map((w) => {
              const on = windowId === w.id;
              return (
                <button
                  key={w.id}
                  onClick={() => setWindowId(w.id)}
                  className="font-data text-[10px] font-bold tracking-widest uppercase px-2 py-1 rounded transition-all"
                  style={{
                    color: on ? "var(--red)" : "var(--text-muted)",
                    background: on ? "var(--red-dim)" : "transparent",
                    border: `1px solid ${on ? "var(--red)" : "var(--border)"}`,
                  }}
                >
                  {w.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-1.5 mt-3">
          {groups.map((g) => {
            const on = group === g;
            return (
              <button
                key={g}
                onClick={() => setGroup(g)}
                className="text-[11px] px-2 py-1 rounded transition-all"
                style={{
                  color: on ? "var(--text-primary)" : "var(--text-muted)",
                  background: on ? "var(--khaki-dim)" : "transparent",
                  border: `1px solid ${on ? "var(--khaki)" : "var(--border)"}`,
                }}
              >
                {g === "all" ? t("patterns.allCrime", lang) : g}
              </button>
            );
          })}
          {data && (
            <span className="font-data text-[10px] ml-1" style={{ color: "var(--text-muted)" }}>
              {data.total.toLocaleString()} cases{data.scope ? ` · ${data.scope}` : ""}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && (
          <div className="grid gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-md animate-pulse"
                style={{ height: 160, background: "var(--bg-raised)", animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
        )}

        {!loading && failed && (
          <p className="font-data text-sm" style={{ color: "var(--red)" }}>Could not load patterns.</p>
        )}

        {!loading && data && data.total === 0 && (
          <p className="font-data text-sm" style={{ color: "var(--text-muted)" }}>{t("patterns.empty", lang)}</p>
        )}

        {!loading && data && data.total > 0 && (
          <div className="grid gap-4">
            {/* Hour of day — present only when the corpus actually carries a clock. */}
            <Panel title={t("patterns.hour", lang)}>
              {data.hourSupported ? (
                <>
                  <CountBars axis={data.hour} />
                  <div className="mt-3"><PeakLine axis={data.hour} label="hour" /></div>
                </>
              ) : (
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Hour of day is unavailable in this corpus. <b>CrimeRegisteredDate</b> is a DATE column — it stores no
                  time — and every value in <b>{data.hourSource}</b>, the one timestamp column that could carry a clock,
                  falls at midnight. An hour chart drawn on that would be a single bar dressed up as a finding, so it is
                  withheld. Day of week and month below are unaffected.
                </p>
              )}
            </Panel>

            {data.hourSupported && data.grid.length > 0 && (
              <Panel title={`${t("patterns.weekday", lang)} × ${t("patterns.hour", lang)}`}>
                <HeatGrid grid={data.grid} hourLabels={data.hour.labels} weekdayLabels={data.weekday.labels} />
                <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
                  Darker is busier. Both axes are read off the same instant, so one cell is one claim.
                </p>
              </Panel>
            )}

            <Panel title={t("patterns.weekday", lang)}>
              <CountBars axis={data.weekday} height={130} />
              <div className="mt-3"><PeakLine axis={data.weekday} label="week" /></div>
            </Panel>

            <Panel title="Month of year">
              <CountBars axis={data.month} height={130} />
              <div className="mt-3"><PeakLine axis={data.month} label="year" /></div>
              <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                Months pool every year in the window. A month the window covered for fewer days is expected to be
                shorter, so the test compares each bar against the days it actually got — a 90-day window cannot
                invent a season out of the nine months it never saw.
              </p>
            </Panel>

            {/* The caveats, as text on the page. A warning behind a hover is a warning nobody was given. */}
            <div
              className="rounded-md p-4 text-xs leading-relaxed"
              style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            >
              <div className="font-data text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: "var(--text-muted)" }}>
                How this was measured
              </div>
              <p>{t("patterns.caveat", lang)}</p>
              <p className="mt-2">{data.method}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
