"use client";
import { useChatStore } from "@/store/chat";
import { t, type StringKey } from "@/lib/i18n";
// Type-only: hotspot-forecast imports Prisma, which must never reach the bundle.
import type { HotspotForecast, PatrolPriority } from "@/lib/hotspot-forecast";

const CONFIDENCE: Record<PatrolPriority["confidence"], { key: StringKey; color: string }> = {
  high:   { key: "hotspot.confidence.high",   color: "var(--red)" },
  medium: { key: "hotspot.confidence.medium", color: "var(--amber)" },
  low:    { key: "hotspot.confidence.low",    color: "var(--text-muted)" },
};

export function ConfidenceChip({ level }: { level: PatrolPriority["confidence"] }) {
  const lang = useChatStore((s) => s.lang);
  const c = CONFIDENCE[level];
  return (
    <span
      className="font-data text-[10px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded shrink-0"
      style={{ color: c.color, border: `1px solid ${c.color}` }}
    >
      {t(c.key, lang)}
    </span>
  );
}

/**
 * The forecast turned into an order: which district × crime group a shift should
 * absorb next, and which stations inside it already carry the load. The list
 * arrives ranked by the API — re-sorting it here would quietly disagree with the
 * ranking the reason sentences were written against.
 */
export function PatrolPriorities({
  forecast,
  state,
  scope,
  onClose,
}: {
  forecast: HotspotForecast | null;
  state: "idle" | "loading" | "error" | "ready";
  scope?: string;
  onClose: () => void;
}) {
  const lang = useChatStore((s) => s.lang);

  return (
    <div className="absolute inset-0 z-[500] flex flex-col overflow-hidden" style={{ background: "var(--bg-base)" }}>
      <div
        className="shrink-0 flex items-start justify-between gap-4 px-5 py-3"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--red)" }} />
            <h3 className="font-data text-xs font-bold tracking-widest uppercase" style={{ color: "var(--red)" }}>
              {t("hotspot.priorities", lang)}
            </h3>
            {scope && (
              <span className="font-data text-[10px] tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                {t("map.scope", lang)}: {scope}
              </span>
            )}
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            {t("hotspot.prioritiesSubtitle", lang)}
          </p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 font-data text-xs px-2 py-1 rounded transition-all"
          style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
        >
          {t("hotspot.close", lang)} ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {state === "loading" && (
          <p className="font-data text-sm" style={{ color: "var(--text-muted)" }}>{t("hotspot.loading", lang)}</p>
        )}
        {state === "error" && (
          <p className="font-data text-sm" style={{ color: "var(--red)" }}>{t("hotspot.error", lang)}</p>
        )}

        {forecast && !forecast.priorities.length && (
          <p className="font-data text-sm" style={{ color: "var(--text-muted)" }}>
            {t("hotspot.prioritiesEmpty", lang)}
          </p>
        )}

        <div className="grid gap-3">
          {forecast?.priorities.map((p) => (
            <div
              key={`${p.districtId}-${p.crimeGroup}`}
              className="rounded-md p-3"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="font-data text-sm font-bold shrink-0 w-7 text-right"
                  style={{ color: "var(--text-muted)" }}
                >
                  #{p.rank}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{p.district}</span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>·</span>
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>{p.crimeGroup}</span>
                    <ConfidenceChip level={p.confidence} />
                  </div>

                  <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2 font-data text-xs">
                    <span style={{ color: "var(--text-muted)" }}>
                      {t("hotspot.observed30", lang)}{" "}
                      <b style={{ color: "var(--text-primary)" }}>{p.observed30.toLocaleString()}</b>
                      {" → "}
                      <b style={{ color: "var(--red)" }}>{p.predicted30.toLocaleString()}</b>{" "}
                      {t("hotspot.predicted30", lang)}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {t("hotspot.trend", lang)}{" "}
                      <b style={{ color: "var(--amber)" }}>
                        {p.slopePerMonth > 0 ? "+" : ""}{p.slopePerMonth}
                      </b>
                      {t("hotspot.perMonth", lang)}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {t("hotspot.fit", lang)} <b style={{ color: "var(--text-primary)" }}>{p.fit}</b>
                    </span>
                  </div>

                  {p.stations.length > 0 && (
                    <div className="mt-2">
                      <p className="font-data text-[10px] tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                        {t("hotspot.stations", lang)}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {p.stations.map((s) => (
                          <span
                            key={s.station}
                            className="font-data text-xs px-1.5 py-0.5 rounded"
                            style={{ background: "var(--amber-dim)", color: "var(--text-primary)" }}
                          >
                            {s.station} <b style={{ color: "var(--amber)" }}>{s.share}%</b>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    <span className="font-data text-[10px] tracking-widest uppercase mr-1" style={{ color: "var(--text-muted)" }}>
                      {t("hotspot.reason", lang)}
                    </span>
                    {p.reason}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Method sits with the numbers, not behind a tooltip — this is a police tool. */}
        {forecast && (
          <div className="mt-5 pt-3 space-y-1" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              <b>{t("hotspot.method", lang)}:</b> {forecast.method}
            </p>
            <p className="font-data text-[11px]" style={{ color: "var(--text-muted)" }}>
              {t("hotspot.monthsFitted", lang)}: {forecast.months.join(" · ")}
            </p>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {t("hotspot.districtNote", lang)} {t("hotspot.stationsNote", lang)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
