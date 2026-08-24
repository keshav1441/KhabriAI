"use client";
import { useEffect, useState } from "react";
import { CaseDrawer } from "../viz/CaseDrawer";
import { useChatStore, type Lang } from "@/store/chat";
import { t } from "@/lib/i18n";

/**
 * The repeat-victimisation screen. Two things have to survive the design: the
 * headline ratio (a few people carry a large share of the crime — that is the
 * finding, not the list) and the caveat, which is rendered as plain visible
 * text rather than a tooltip, because every name below is an inference from a
 * register that holds no address.
 */

type Reason = { signal: string; weight: number; label: string };
type VCase = {
  caseId: number; crimeNo: string | null; date: string | null; district: string | null;
  station: string | null; crimeType: string | null; status: string | null; ageRecorded: number | null;
};
type Cluster = {
  id: string;
  person: { name: string; age: number | null; gender: string | null };
  cases: VCase[];
  caseCount: number;
  first: string | null;
  last: string | null;
  spanDays: number | null;
  districts: string[];
  stations: string[];
  crimeTypes: string[];
  confidence: number;
  reasons: Reason[];
  capped: "mononym" | "common-name" | null;
};
type Distribution = {
  victimRecords: number; cases: number; people: number; repeatPeople: number;
  repeatShare: number; repeatCases: number; repeatCaseShare: number; maxCases: number;
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const pct = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;

// Confidence is a claim about identity, so it is coloured as a warning long
// before it is coloured as a fact.
function confColor(c: number): string {
  if (c >= 0.8) return "var(--green)";
  if (c >= 0.68) return "var(--blue)";
  return "var(--amber)";
}

export function VictimsView() {
  const lang = useChatStore((s) => s.lang);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [dist, setDist] = useState<Distribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [minCases, setMinCases] = useState(2);
  const [open, setOpen] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<number | null>(null);

  // The pairwise match behind /api/victims runs for tens of seconds, so a
  // relaxed threshold can still be in flight when a stricter one comes back —
  // without the flag the slow first answer overwrites the fast second.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/victims?minCases=${minCases}&limit=200`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setClusters(d.clusters ?? []);
        setDist(d.distribution ?? null);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [minCases]);

  return (
    <div className="flex flex-col h-full">
      {/* Heading */}
      <div className="shrink-0 px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <h2 className="font-display font-bold tracking-tight" style={{ color: "var(--text-primary)", fontSize: "1.05rem" }}>
          {t("victims.title", lang)}
        </h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          {t("victims.subtitle", lang)}
        </p>
      </div>

      {/* The finding, before the list. */}
      <div
        className="shrink-0 px-6 py-4 flex flex-wrap items-center gap-x-8 gap-y-3"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}
      >
        {loading || !dist ? (
          Array.from({ length: 3 }).map((_, i) => (
            <span key={i} className="inline-block h-8 w-28 rounded animate-pulse" style={{ background: "var(--bg-raised)" }} />
          ))
        ) : (
          <>
            <Headline
              value={pct(dist.repeatShare)}
              label={`${dist.repeatPeople.toLocaleString("en-IN")} of ${dist.people.toLocaleString("en-IN")} victims`}
              caption="victimised more than once"
              accent="var(--amber)"
            />
            <span className="font-data text-lg" style={{ color: "var(--text-muted)" }}>→</span>
            <Headline
              value={pct(dist.repeatCaseShare)}
              label={`${dist.repeatCases.toLocaleString("en-IN")} of ${dist.cases.toLocaleString("en-IN")} cases`}
              caption="of the crime they absorb"
              accent="var(--red)"
            />
            <Headline
              value={String(dist.maxCases)}
              label="cases against one person"
              caption="the most victimised individual here"
              accent="var(--text-primary)"
            />
            <div className="ml-auto flex items-center gap-2">
              <label className="font-data uppercase tracking-widest" style={{ color: "var(--text-muted)", fontSize: "0.6rem" }}>
                Min cases
              </label>
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setMinCases(n)}
                  className="font-data text-xs font-bold px-2 py-0.5 rounded transition-all"
                  style={{
                    color: minCases === n ? "var(--red)" : "var(--text-muted)",
                    background: minCases === n ? "var(--red-dim)" : "var(--bg-raised)",
                    border: `1px solid ${minCases === n ? "var(--red)" : "var(--border)"}`,
                  }}
                >
                  {n}+
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* The caveat, as text, above the names it applies to. */}
      <div className="shrink-0 px-6 py-2.5" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-raised)" }}>
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <span className="font-data font-bold" style={{ color: "var(--amber)" }}>⚠ </span>
          {t("victims.caveat", lang)}
        </p>
      </div>

      {/* The list */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="space-y-2 max-w-4xl">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-14 rounded-md animate-pulse"
                style={{ background: "var(--bg-raised)", animationDelay: `${i * 50}ms` }}
              />
            ))}
          </div>
        ) : clusters.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>{t("victims.empty", lang)}</span>
          </div>
        ) : (
          <div className="space-y-2 max-w-4xl">
            {clusters.map((c, i) => (
              <ClusterRow
                key={c.id}
                cluster={c}
                rank={i + 1}
                lang={lang}
                expanded={open === c.id}
                onToggle={() => setOpen(open === c.id ? null : c.id)}
                onOpenCase={setCaseId}
              />
            ))}
          </div>
        )}
      </div>

      <CaseDrawer caseId={caseId} onClose={() => setCaseId(null)} />
    </div>
  );
}

function Headline({ value, label, caption, accent }: { value: string; label: string; caption: string; accent: string }) {
  return (
    <div>
      <div className="font-data font-bold leading-none" style={{ color: accent, fontSize: "1.6rem" }}>{value}</div>
      <div className="font-data mt-1" style={{ color: "var(--text-secondary)", fontSize: "0.68rem" }}>{label}</div>
      <div style={{ color: "var(--text-muted)", fontSize: "0.65rem" }}>{caption}</div>
    </div>
  );
}

function ClusterRow({
  cluster: c, rank, lang, expanded, onToggle, onOpenCase,
}: {
  cluster: Cluster; rank: number; lang: Lang; expanded: boolean;
  onToggle: () => void; onOpenCase: (id: number) => void;
}) {
  return (
    <div className="rounded-md overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center gap-4 transition-all"
        style={{ background: expanded ? "var(--bg-raised)" : "transparent" }}
      >
        <span className="font-data shrink-0" style={{ color: "var(--text-muted)", fontSize: "0.65rem", width: 22 }}>
          {String(rank).padStart(2, "0")}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block font-display font-bold truncate" style={{ color: "var(--text-primary)", fontSize: "0.9rem" }}>
            {c.person.name}
          </span>
          <span className="block font-data truncate" style={{ color: "var(--text-muted)", fontSize: "0.65rem" }}>
            {[c.person.age != null ? `${c.person.age} yrs` : null, c.person.gender, c.districts.join(", ")]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>

        <span className="shrink-0 text-right hidden sm:block">
          <span className="font-data font-bold block" style={{ color: "var(--red)", fontSize: "1.05rem", lineHeight: 1 }}>
            {c.caseCount}
          </span>
          <span className="font-data block" style={{ color: "var(--text-muted)", fontSize: "0.6rem" }}>
            {t("victims.cases", lang)}
          </span>
        </span>

        <span className="shrink-0 text-right hidden md:block" style={{ width: 190 }}>
          <span className="font-data block" style={{ color: "var(--text-secondary)", fontSize: "0.65rem" }}>
            {t("victims.span", lang)} {fmtDate(c.first)} – {fmtDate(c.last)}
          </span>
          <span className="font-data block" style={{ color: "var(--text-muted)", fontSize: "0.6rem" }}>
            {c.spanDays != null ? `${c.spanDays} days` : "—"}
          </span>
        </span>

        <Confidence c={c} lang={lang} />

        <span className="shrink-0 font-data" style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          {/* Why these files were put together, in the signals' own words. */}
          <div className="flex flex-wrap gap-1.5 py-2.5">
            {c.reasons.map((r) => (
              <span
                key={r.signal}
                className="font-data px-2 py-0.5 rounded"
                style={{ background: "var(--bg-raised)", color: "var(--text-secondary)", fontSize: "0.62rem" }}
                title={`${r.signal} · ${r.weight}`}
              >
                {r.label}
              </span>
            ))}
            {c.capped && (
              <span
                className="font-data px-2 py-0.5 rounded"
                style={{ background: "var(--amber-dim)", color: "var(--amber)", fontSize: "0.62rem" }}
              >
                {c.capped === "common-name"
                  ? "Confidence held down — this name is common in the register"
                  : "Confidence held down — a single given name is not an identity"}
              </span>
            )}
          </div>

          <table className="w-full text-xs border-collapse">
            <tbody>
              {c.cases.map((k) => (
                <tr
                  key={k.caseId}
                  onClick={() => onOpenCase(k.caseId)}
                  style={{ borderTop: "1px solid var(--border-subtle)", cursor: "pointer" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-raised)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <td className="px-2 py-2 font-data whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                    {fmtDate(k.date)}
                  </td>
                  <td className="px-2 py-2 font-data" style={{ color: "var(--text-primary)" }}>{k.crimeNo ?? "—"}</td>
                  <td className="px-2 py-2" style={{ color: "var(--text-primary)" }}>{k.crimeType ?? "—"}</td>
                  <td className="px-2 py-2" style={{ color: "var(--text-secondary)" }}>
                    {[k.station, k.district].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-2 py-2 font-data" style={{ color: "var(--text-muted)" }}>
                    {k.ageRecorded != null ? `age ${k.ageRecorded}` : "—"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <span className="font-data font-bold px-2 py-0.5 rounded" style={{ color: "var(--red)", background: "var(--red-dim)", fontSize: "0.6rem" }}>
                      OPEN ↗
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Confidence({ c, lang }: { c: Cluster; lang: Lang }) {
  const color = confColor(c.confidence);
  return (
    <span className="shrink-0" style={{ width: 96 }} title={t("victims.confidence", lang)}>
      <span className="flex items-center justify-end gap-1.5">
        <span className="font-data font-bold" style={{ color, fontSize: "0.7rem" }}>
          {Math.round(c.confidence * 100)}%
        </span>
      </span>
      <span className="block rounded mt-1" style={{ height: 3, background: "var(--bg-raised)" }}>
        <span className="block rounded" style={{ height: 3, width: `${Math.round(c.confidence * 100)}%`, background: color }} />
      </span>
      <span className="block font-data text-right mt-0.5" style={{ color: "var(--text-muted)", fontSize: "0.55rem" }}>
        {t("victims.confidence", lang)}
      </span>
    </span>
  );
}
