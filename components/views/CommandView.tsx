"use client";
import { useCallback, useEffect, useState } from "react";
import { useChatStore } from "@/store/chat";
import { t, type StringKey } from "@/lib/i18n";
import { ConfidenceChip } from "./PatrolPriorities";
import {
  buildFigures,
  panelFromResponse,
  severityColor,
  summariseMapPoints,
  TONE_COLOR,
  type AlertsPayload,
  type CustodyPayload,
  type Figure,
  type ForecastPayload,
  type MapPointsPayload,
  type PanelResult,
  type PendencyPayload,
  type PipelinePayload,
  type QualityPayload,
} from "@/lib/command-summary";
// Type-only: these modules import Prisma types, which must never reach the bundle.
import type { HotspotForecast } from "@/lib/hotspot-forecast";
import type { Pipeline } from "@/lib/pipeline";
import type { TimePatterns } from "@/lib/time-patterns";

/** The alert feed's row shape, as /api/alerts serves it — same fields the bell reads. */
interface Alert {
  id: string;
  kind: string;
  severity: string;
  title: string;
  detail: string;
  query: string;
  createdAt: string;
  readAt: string | null;
}

interface AlertFeed extends AlertsPayload {
  alerts?: Alert[] | null;
}

interface VictimsPayload {
  distribution?: {
    people?: number | null;
    repeatPeople?: number | null;
    repeatShare?: number | null;
    repeatCaseShare?: number | null;
    maxCases?: number | null;
  } | null;
}

const KIND_LABEL: Record<string, StringKey> = {
  spike: "alerts.kind.spike",
  repeat_suspect: "alerts.kind.repeat_suspect",
  weekly_surge: "alerts.kind.weekly_surge",
  forecast: "alerts.kind.forecast",
  mo_link: "alerts.kind.mo_link",
};

/** Same funnel colours as the pipeline screen — the miniature must read as the same object. */
const STAGE_COLOR: Record<string, string> = {
  registered: "var(--blue)",
  arrested: "var(--amber)",
  chargesheet: "var(--green)",
  court: "var(--text-muted)",
};

function stageKey(id: string): StringKey {
  return `pipeline.${id}` as StringKey;
}

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h` : `${Math.round(hrs / 24)}d`;
}

/**
 * Every panel owns its own fetch. One endpoint being slow — the repeat-victim
 * scan runs a pairwise match and is allowed a minute — must not hold the other
 * eight behind it, and one endpoint failing must not blank a screen someone is
 * about to brief off. `null` here means still loading; the states after that
 * are the module's, so "not yours" and "broke" stay different things.
 */
function usePanel<T>(url: string): PanelResult<T> | null {
  const [result, setResult] = useState<PanelResult<T> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    fetch(url)
      .then(async (r) => {
        const body = (await r.json().catch(() => null)) as T | null;
        if (!cancelled) setResult(panelFromResponse<T>(r.status, body));
      })
      .catch(() => {
        if (!cancelled) setResult({ state: "failed" });
      });
    return () => { cancelled = true; };
  }, [url]);

  return result;
}

/**
 * The command centre.
 *
 * A dozen capabilities sit behind a dozen nav items, and nobody clicks through
 * eleven screens to find out whether anything is on fire. This is one screen
 * that says what the state of the force is and then gets out of the way: every
 * figure comes from the endpoint that already computes it, and every panel is a
 * door into the full view rather than a second implementation of it.
 *
 * Navigation is handed back to the caller — the dashboard owns the view state,
 * so this asks rather than routes.
 */
export function CommandView({ onNavigate }: { onNavigate?: (view: string) => void } = {}) {
  const lang = useChatStore((s) => s.lang);
  const setDraft = useChatStore((s) => s.setDraft);

  // Summaries are counted in SQL over the whole scope, so a limit of 1 buys the
  // strip its numbers without dragging two hundred rows across the wire.
  const pendency = usePanel<PendencyPayload>("/api/pendency?filter=all&limit=1");
  const custody = usePanel<CustodyPayload>("/api/custody?filter=all&limit=1");
  const alerts = usePanel<AlertFeed>("/api/alerts");
  const forecast = usePanel<ForecastPayload & { forecast?: HotspotForecast }>("/api/forecast/hotspots");
  const pipeline = usePanel<PipelinePayload & Partial<Pipeline>>("/api/pipeline?months=24");
  const mapPoints = usePanel<MapPointsPayload>("/api/map-data?mode=points&cap=1500");
  const victims = usePanel<VictimsPayload>("/api/victims?minCases=2&limit=1");
  const patterns = usePanel<TimePatterns>("/api/patterns");
  // Reviewer-gated. Everyone else gets a 403, which is the rule working: the
  // tile is dropped without a word rather than shown as an error.
  const quality = usePanel<QualityPayload>("/api/admin/data-quality");

  const go = useCallback((view: string) => onNavigate?.(view), [onNavigate]);

  const figures = buildFigures(
    { pendency, custody, alerts, forecast, pipeline, quality },
    (stage) => t(stageKey(stage), lang)
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Headline band */}
      <div
        className="shrink-0 grid gap-px px-6 py-3"
        style={{ borderBottom: "1px solid var(--border)", gridTemplateColumns: `repeat(${figures.length}, minmax(0, 1fr))` }}
      >
        {figures.map((f) => (
          <FigureTile key={f.id} figure={f} lang={lang} loading={isLoading(f, { pendency, custody, alerts, forecast, pipeline, quality })} onOpen={() => go(f.view)} />
        ))}
      </div>

      {/* Panels. Each one states its own loading and failure, so a dead endpoint
          costs a corner of the screen rather than the screen. */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 lg:grid-rows-2 gap-px overflow-auto lg:overflow-hidden"
           style={{ background: "var(--border)" }}>
        {/* Alerts — the feed, not the bell, but the same click. */}
        <Panel
          className="lg:row-span-2"
          title={t("alerts.briefing", lang)}
          hint={alerts?.state === "ok" ? `${alerts.data.last24h ?? 0} ${t("alerts.new24h", lang)}` : null}
          onOpen={() => go("chat")}
        >
          <AlertList
            result={alerts}
            lang={lang}
            onPick={(a) => {
              // The bell's behaviour, kept identical: mark it read, drop its
              // question into the composer, land on the chat.
              if (!a.readAt) {
                fetch("/api/alerts", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ids: [a.id] }),
                }).catch(() => {});
              }
              setDraft(a.query || a.title);
              go("chat");
            }}
          />
        </Panel>

        {/* Predicted hotspots */}
        <Panel title={t("map.list.predicted", lang)} hint={t("hotspot.predicted30", lang)} onOpen={() => go("map")}>
          <PanelBody
            result={forecast}
            lang={lang}
            failed={t("hotspot.error", lang)}
            render={(d) => {
              const districts = (d.forecast?.districts ?? []).slice(0, 4);
              if (!districts.length) return <Empty text={t("hotspot.empty", lang)} />;
              const top = Math.max(1, ...districts.map((x) => x.predicted));
              return (
                <div className="px-4 py-3 space-y-2.5">
                  {districts.map((x) => (
                    <div key={x.districtId}>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-bold truncate" style={{ color: "var(--text-primary)" }}>{x.district}</span>
                        <ConfidenceChip level={x.confidence} />
                        <span className="font-data text-xs ml-auto shrink-0" style={{ color: "var(--text-primary)" }}>
                          {Math.round(x.predicted).toLocaleString()}
                        </span>
                        <span
                          className="font-data text-[10px] shrink-0"
                          style={{ color: x.delta > 0 ? "var(--red)" : "var(--green)" }}
                        >
                          {x.delta > 0 ? "+" : ""}{Math.round(x.delta).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-sm overflow-hidden" style={{ background: "var(--bg-raised)" }}>
                        <div className="h-full rounded-sm" style={{ width: `${(x.predicted / top) * 100}%`, background: "var(--red)", opacity: 0.75 }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            }}
          />
        </Panel>

        {/* Incident map, counted rather than drawn — see the note on MapSummary. */}
        <Panel title={t("map.layer.incidents", lang)} hint={t("map.incidentHint", lang)} onOpen={() => go("map")}>
          <PanelBody
            result={mapPoints}
            lang={lang}
            failed={t("map.loading", lang)}
            render={(d) => {
              const shares = summariseMapPoints(d);
              if (!shares.length) return <Empty text={t("map.noCoords", lang)} />;
              return (
                <div className="px-4 py-3">
                  <p className="font-data text-[10px] tracking-widest uppercase mb-2" style={{ color: "var(--text-muted)" }}>
                    {`${(d.total ?? 0).toLocaleString()} ${t("map.incidentCount", lang)} · ${(d.missingCoords ?? 0).toLocaleString()} ${t("map.noCoords", lang)}`}
                  </p>
                  <div className="space-y-1.5">
                    {shares.map((s) => (
                      <div key={s.district} className="flex items-center gap-2">
                        <span className="text-xs truncate" style={{ width: 110, color: "var(--text-primary)" }}>{s.district}</span>
                        <div className="flex-1 h-1.5 rounded-sm overflow-hidden" style={{ background: "var(--bg-raised)" }}>
                          <div className="h-full rounded-sm" style={{ width: `${s.share * 100}%`, background: "var(--blue)", opacity: 0.8 }} />
                        </div>
                        <span className="font-data text-xs shrink-0" style={{ color: "var(--text-secondary)" }}>
                          {s.count.toLocaleString()} {t("map.cases", lang)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }}
          />
        </Panel>

        {/* Funnel, in miniature */}
        <Panel title={t("pipeline.title", lang)} hint={t("pipeline.subtitle", lang)} onOpen={() => go("pipeline")}>
          <PanelBody
            result={pipeline}
            lang={lang}
            failed={t("pipeline.empty", lang)}
            render={(d) => {
              const stages = d.stages ?? [];
              const total = stages[0]?.reached ?? d.totalCases ?? 0;
              if (!stages.length || !total) return <Empty text={t("pipeline.empty", lang)} />;
              return (
                <div className="px-4 py-3 space-y-2">
                  {stages.map((s) => (
                    <div key={s.id}>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs" style={{ color: s.measured ? "var(--text-primary)" : "var(--text-muted)" }}>
                          {t(stageKey(s.id), lang)}
                        </span>
                        <span className="font-data text-xs ml-auto" style={{ color: "var(--text-secondary)" }}>
                          {s.reached === null ? "—" : s.reached.toLocaleString()}
                        </span>
                        {s.dropOff ? (
                          <span className="font-data text-[10px] shrink-0" style={{ color: "var(--red)" }}>
                            {`−${s.dropOffPct ?? 0}%`}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 h-2 rounded-sm overflow-hidden" style={{ background: "var(--bg-raised)" }}>
                        <div
                          className="h-full rounded-sm"
                          style={{
                            width: `${s.reached === null ? 0 : Math.max(2, (s.reached / total) * 100)}%`,
                            background: STAGE_COLOR[s.id] ?? "var(--blue)",
                            // The court stage is drawn hollow: the schema has no
                            // court date and lib/pipeline refuses to invent one.
                            opacity: s.measured ? 0.85 : 0.25,
                            border: s.measured ? "none" : "1px dashed var(--border)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              );
            }}
          />
        </Panel>

        {/* Two standing findings that are worth a line each on the opening screen. */}
        <Panel title={t("victims.title", lang)} hint={t("patterns.title", lang)} onOpen={() => go("victims")}>
          <div className="px-4 py-3 space-y-3">
            <PanelBody
              result={victims}
              lang={lang}
              failed={t("victims.empty", lang)}
              render={(d) => {
                const dist = d.distribution;
                if (!dist?.repeatPeople) return <Empty text={t("victims.empty", lang)} />;
                return (
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-data text-lg font-bold" style={{ color: "var(--amber)" }}>
                        {dist.repeatPeople.toLocaleString()}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {`people · ${Math.round((dist.repeatCaseShare ?? 0) * 100)}% of cases`}
                      </span>
                    </div>
                    <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>{t("victims.caveat", lang)}</p>
                  </div>
                );
              }}
            />

            <div style={{ borderTop: "1px solid var(--border-subtle)" }} />

            {/* "When crime happens" reports FLAT for this corpus. The tallest bar
                is not a pattern, so the peak is only ever printed when the
                chi-square test rejected a flat distribution. */}
            <button className="w-full text-left" onClick={() => go("patterns")}>
              <PanelBody
                result={patterns}
                lang={lang}
                failed={t("patterns.empty", lang)}
                render={(d) => {
                  const peak = d.weekday?.peak;
                  if (!peak || !d.total) return <Empty text={t("patterns.empty", lang)} />;
                  return (
                    <div>
                      <span className="font-data text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                        {t("patterns.peak", lang)}
                      </span>
                      {peak.verdict === "peak" ? (
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-primary)" }}>
                          <b style={{ color: "var(--red)" }}>{d.weekday.peakLabel}</b>{" "}
                          <span style={{ color: "var(--text-secondary)" }}>
                            {`+${Math.round((peak.lift - 1) * 100)}% on baseline · p<0.05`}
                          </span>
                        </p>
                      ) : (
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                          {`No window stands out — the spread is within ordinary variation (p=${peak.p.toFixed(2)}).`}
                        </p>
                      )}
                    </div>
                  );
                }}
              />
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** Which panel a figure is waiting on — a tile should skeleton while its own source loads. */
function isLoading(
  f: Figure,
  panels: { pendency: unknown; custody: unknown; alerts: unknown; forecast: unknown; pipeline: unknown; quality: unknown }
): boolean {
  switch (f.id) {
    case "openCases":
    case "overdue":
      return panels.pendency === null;
    case "noneBroughtIn":
      return panels.custody === null;
    case "unreadAlerts":
      return panels.alerts === null;
    case "hottestDistrict":
      return panels.forecast === null;
    case "bottleneck":
      return panels.pipeline === null;
    case "dataQuality":
      return panels.quality === null;
    default:
      return false;
  }
}

function FigureTile({ figure, lang, loading, onOpen }: { figure: Figure; lang: "en" | "kn"; loading: boolean; onOpen: () => void }) {
  const label = "key" in figure.label ? t(figure.label.key as StringKey, lang) : figure.label.text;
  return (
    <button className="text-left min-w-0" onClick={onOpen} title={label}>
      <div className="font-data text-lg font-bold truncate" style={{ color: TONE_COLOR[figure.tone] }}>
        {loading ? (
          <span className="inline-block h-5 w-10 rounded animate-pulse" style={{ background: "var(--bg-raised)" }} />
        ) : (
          // A dash, never a zero: a figure whose endpoint failed is unknown, not nil.
          figure.value ?? "—"
        )}
      </div>
      <div className="font-data text-[10px] tracking-widest uppercase truncate" style={{ color: "var(--text-muted)" }}>{label}</div>
      {figure.note && (
        <div className="font-data text-[10px] truncate" style={{ color: "var(--text-muted)", opacity: 0.75 }}>{figure.note}</div>
      )}
    </button>
  );
}

function Panel({
  title, hint, onOpen, className, children,
}: { title: string; hint?: string | null; onOpen: () => void; className?: string; children: React.ReactNode }) {
  return (
    <section className={`flex flex-col min-h-0 overflow-hidden ${className ?? ""}`} style={{ background: "var(--bg-base)" }}>
      <header className="shrink-0 flex items-baseline gap-2 px-4 py-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <h3 className="text-xs font-bold truncate" style={{ color: "var(--text-primary)" }}>{title}</h3>
        {hint && <span className="text-[11px] truncate hidden xl:block" style={{ color: "var(--text-muted)" }}>{hint}</span>}
        <button
          onClick={onOpen}
          className="font-data text-[10px] font-bold tracking-widest uppercase ml-auto shrink-0 px-1.5 py-0.5 rounded"
          style={{ color: "var(--red)", background: "var(--red-dim)" }}
        >
          OPEN ↗
        </button>
      </header>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </section>
  );
}

/** Loading, failure and "not yours", said the same way in every panel. */
function PanelBody<T>({
  result, lang, failed, render,
}: { result: PanelResult<T> | null; lang: "en" | "kn"; failed: string; render: (data: T) => React.ReactNode }) {
  if (result === null) {
    return (
      <div className="px-4 py-3 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <span key={i} className="block h-6 rounded animate-pulse" style={{ background: "var(--bg-raised)", animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
    );
  }
  // "Not yours" is not an error and gets no red text — the panel has nothing to
  // say to this caller and says nothing.
  if (result.state === "unavailable") return null;
  if (result.state === "failed") return <div className="px-4 py-4"><span className="text-xs" style={{ color: "var(--red)" }}>{failed}</span></div>;
  return <>{render(result.data)}</>;
}

function Empty({ text }: { text: string }) {
  return (
    <div className="px-4 py-4">
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{text}</span>
    </div>
  );
}

function AlertList({ result, lang, onPick }: { result: PanelResult<AlertFeed> | null; lang: "en" | "kn"; onPick: (a: Alert) => void }) {
  // Clicking an alert marks it read on the server; the row has to stop looking
  // unread here too, without refetching the whole feed underneath the officer.
  const [read, setRead] = useState<Set<string>>(new Set());

  return (
    <PanelBody
      result={result}
      lang={lang}
      failed={t("alerts.empty", lang)}
      render={(d) => {
        const rows = (d.alerts ?? []).slice(0, 8);
        if (!rows.length) return <Empty text={t("alerts.empty", lang)} />;
        return (
          <div>
            {rows.map((a) => {
              const color = severityColor(a.severity);
              const isRead = Boolean(a.readAt) || read.has(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => { setRead((s) => new Set(s).add(a.id)); onPick(a); }}
                  className="w-full text-left px-4 py-2.5"
                  style={{
                    borderBottom: "1px solid var(--border-subtle)",
                    borderLeft: `3px solid ${color}`,
                    background: isRead ? "transparent" : "var(--bg-raised)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-data text-[10px] font-bold tracking-widest uppercase" style={{ color }}>
                      {t(KIND_LABEL[a.kind] ?? "alerts.kind.default", lang)}
                    </span>
                    <span className="font-data text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>{ago(a.createdAt)}</span>
                  </div>
                  <p className="text-xs font-semibold mt-0.5" style={{ color: "var(--text-primary)" }}>{a.title}</p>
                  <p className="text-xs mt-0.5 leading-relaxed line-clamp-2" style={{ color: "var(--text-secondary)" }}>{a.detail}</p>
                  <p className="font-data text-[10px] mt-1" style={{ color }}>{t("alerts.investigate", lang)}</p>
                </button>
              );
            })}
          </div>
        );
      }}
    />
  );
}
