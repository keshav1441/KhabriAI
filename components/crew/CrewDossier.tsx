"use client";
import { useEffect, useState } from "react";
// Type-only — lib/crew.ts reaches for the server Prisma client, so this import
// must never survive into the browser bundle.
import type { CrewDossier as Dossier, CrewCase } from "@/lib/crew";
import { STATUS_STYLE } from "@/lib/caseStatus";
import { useChatStore, type Lang } from "@/store/chat";
import { t } from "@/lib/i18n";

interface Props {
  caseId?: number | null;
  personId?: string | null;
  onClose: () => void;
  /** Lets the host swap to a full case file when a timeline row is clicked. */
  onOpenCase?: (id: number) => void;
  /** The crew view embeds the panel in the page; the drawer floats it over one. */
  inline?: boolean;
}

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export function CrewDossier({ caseId, personId, onClose, onOpenCase, inline }: Props) {
  const lang = useChatStore((s) => s.lang);
  const [data, setData] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!caseId && !personId) { setData(null); return; }
    const qs = caseId ? `caseId=${caseId}` : `personId=${encodeURIComponent(String(personId))}`;
    let cancelled = false;
    setData(null);
    setError("");
    setLoading(true);
    fetch(`/api/crew?${qs}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || "");
        return body;
      })
      .then((body) => { if (!cancelled) { setData(body.dossier ?? null); setLoading(false); } })
      .catch((e: Error) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [caseId, personId]);

  if (!caseId && !personId) return null;

  const body = (
    <>
      <Header
        label={data?.seed.label ?? (caseId ? `#${caseId}` : String(personId ?? ""))}
        lang={lang}
        onClose={onClose}
      />

      <div className={inline ? "flex-1 overflow-y-auto p-5 space-y-5" : "overflow-y-auto p-5 space-y-5 animate-fade-up"}
           style={inline ? undefined : { maxHeight: "calc(88vh - 72px)" }}>
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3" style={{ color: "var(--text-muted)" }}>
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0110 10" stroke="var(--red)" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <span className="text-sm font-data">{t("crew.loading", lang)}</span>
            </div>
          </div>
        )}

        {!loading && error && (
          <p className="text-sm font-data" style={{ color: "var(--red)" }}>
            {error || t("crew.error", lang)}
          </p>
        )}

        {!loading && !error && data && data.cases.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>{t("crew.empty", lang)}</p>
        )}

        {!loading && !error && data && data.cases.length > 0 && (
          <>
            <SummaryStrip d={data} lang={lang} />

            {data.truncated && (
              <p className="text-[11px] font-data px-2.5 py-2 rounded"
                 style={{ color: "var(--amber)", background: "var(--amber-dim)", border: "1px solid var(--amber)" }}>
                {t("crew.truncated", lang)}
              </p>
            )}

            {data.signature.length > 0 && (
              <Section title={t("crew.signature", lang)}>
                <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>
                  {t("crew.signatureNote", lang)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {data.signature.map((phrase) => (
                    <span key={phrase} className="text-xs px-2 py-0.5 rounded font-data"
                          style={{ background: "var(--khaki-dim)", border: "1px solid var(--khaki)", color: "var(--khaki)" }}>
                      {phrase}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            <Section title={`${t("crew.members", lang)} (${data.members.length})`}>
              <MembersTable d={data} lang={lang} />
            </Section>

            <Section title={`${t("crew.timeline", lang)} (${data.cases.length})`}>
              <Timeline d={data} lang={lang} onOpenCase={onOpenCase} />
            </Section>
          </>
        )}
      </div>

      {data && data.cases.length > 0 && <PrintDossier d={data} floating={!inline} />}
    </>
  );

  if (inline) {
    return (
      <div className="flex flex-col h-full min-h-0" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        {body}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full flex flex-col"
        style={{
          maxWidth: 780,
          maxHeight: "88vh",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {body}
      </div>
    </div>
  );
}

function Header({ label, lang, onClose }: { label: string; lang: Lang; onClose: () => void }) {
  return (
    <div className="shrink-0 px-5 py-4 flex items-center justify-between"
         style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="badge-classified">{t("crew.tag", lang)}</span>
        </div>
        <h2 className="font-bold tracking-tight truncate" style={{ color: "var(--text-primary)" }}>
          {label || "—"}
        </h2>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => window.print()}
          className="text-xs font-medium px-3 py-1.5 rounded-md transition-all"
          style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--ink)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--ink)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
          title={t("crew.exportPdf", lang)}
        >
          ↓ PDF
        </button>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-md flex items-center justify-center text-lg transition-all"
          style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--red)"; (e.currentTarget as HTMLElement).style.color = "var(--red)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
          title={t("crew.close", lang)}
        >
          ×
        </button>
      </div>
    </div>
  );
}

function SummaryStrip({ d, lang }: { d: Dossier; lang: Lang }) {
  const s = d.summary;
  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <Stat label={t("crew.sum.cases", lang)} value={s.cases} />
        <Stat label={t("crew.sum.members", lang)} value={s.members} />
        <Stat label={t("crew.sum.districts", lang)} value={s.districts} accent={d.crossDistrict ? "var(--red)" : undefined} />
        <Stat label={t("crew.sum.arrested", lang)} value={s.arrested} />
        <Stat label={t("crew.sum.chargesheeted", lang)} value={s.chargesheeted} />
        <Stat label={t("crew.sum.open", lang)} value={s.open} accent={s.open > 0 ? "var(--amber)" : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2">
        <span className="font-data text-[11px]" style={{ color: "var(--text-muted)" }}>
          {t("crew.span", lang)} {fmtDate(s.first)} → {fmtDate(s.last)}
        </span>
        {/* The whole point of the walk: a series nobody sees because it sits in two files in two districts. */}
        {d.crossDistrict ? (
          <span className="font-data text-[11px] font-bold tracking-widest px-2 py-0.5 rounded"
                style={{ color: "var(--red)", background: "var(--red-dim)", border: "1px solid var(--red)" }}>
            {t("crew.crossDistrict", lang)} · {d.districts.join(" · ")}
          </span>
        ) : (
          <span className="font-data text-[11px]" style={{ color: "var(--text-muted)" }}>
            {t("crew.singleDistrict", lang)}{d.districts[0] ? ` · ${d.districts[0]}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-md px-2.5 py-2" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
      <div className="font-data text-lg font-bold leading-none tabular-nums" style={{ color: accent ?? "var(--text-primary)" }}>
        {value}
      </div>
      <div className="text-[10px] mt-1 uppercase tracking-wider font-data" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
    </div>
  );
}

function MembersTable({ d, lang }: { d: Dossier; lang: Lang }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr className="font-data text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            <th className="text-left py-1.5 pr-3">{t("crew.col.name", lang)}</th>
            <th className="text-left py-1.5 pr-3">{t("crew.col.personId", lang)}</th>
            <th className="text-left py-1.5 pr-3">{t("crew.col.age", lang)}</th>
            <th className="text-right py-1.5 pr-3">{t("crew.col.inCrew", lang)}</th>
            <th className="text-right py-1.5 pr-3">{t("crew.col.total", lang)}</th>
            <th className="text-left py-1.5 pr-3">{t("crew.col.districts", lang)}</th>
            <th className="text-right py-1.5">{t("crew.col.arrests", lang)}</th>
          </tr>
        </thead>
        <tbody>
          {/* The API ranks members by how central they are to the crew — keep that order. */}
          {d.members.map((m) => (
            <tr key={m.personId} style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
              <td className="py-1.5 pr-3 font-medium" style={{ color: "var(--red)" }}>{m.name}</td>
              <td className="py-1.5 pr-3 font-data" style={{ color: "var(--text-muted)" }}>{m.personId}</td>
              <td className="py-1.5 pr-3 font-data" style={{ color: "var(--text-secondary)" }}>
                {m.age ?? "—"} · {m.gender ?? "—"}
              </td>
              <td className="py-1.5 pr-3 text-right font-data tabular-nums">{m.casesInCrew}</td>
              <td className="py-1.5 pr-3 text-right font-data tabular-nums" style={{ color: "var(--text-secondary)" }}>{m.totalCases}</td>
              <td className="py-1.5 pr-3" style={{ color: m.districts.length > 1 ? "var(--red)" : "var(--text-secondary)" }}>
                {m.districts.join(", ") || "—"}
              </td>
              <td className="py-1.5 text-right font-data tabular-nums" style={{ color: "var(--text-secondary)" }}>{m.arrests}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Timeline({ d, lang, onOpenCase }: { d: Dossier; lang: Lang; onOpenCase?: (id: number) => void }) {
  // The walk records whether an MO hop jumped a district; surface it on the row
  // it produced rather than burying it in the link list.
  const crossed = new Set(d.moLinks.filter((l) => l.crossDistrict).map((l) => l.to));

  return (
    <div className="space-y-1.5">
      {d.cases.map((c) => {
        const isCross = c.link === "mo" && crossed.has(c.id);
        const st = STATUS_STYLE[c.status ?? ""] ?? { color: "var(--text-muted)", bg: "var(--bg-raised)" };
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onOpenCase?.(c.id)}
            disabled={!onOpenCase}
            className="w-full text-left rounded px-2.5 py-2 transition-colors disabled:cursor-default"
            style={{
              background: "var(--bg-elevated)",
              border: `1px solid ${isCross ? "var(--red)" : "var(--border)"}`,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-data text-xs" style={{ color: "var(--ink)" }}>
                {c.crimeNo} <span style={{ color: "var(--text-muted)" }}>· {fmtDate(c.date)}</span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] px-1.5 py-0.5 rounded font-data font-bold" style={{ color: st.color, background: st.bg }}>
                  {c.status || "—"}
                </span>
                <LinkBadge c={c} isCross={isCross} lang={lang} />
              </span>
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {c.crimeType ?? "—"} · <span style={{ color: isCross ? "var(--red)" : "var(--text-secondary)" }}>{c.district ?? "—"}</span>
              {c.station ? ` · ${c.station}` : ""}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function LinkBadge({ c, isCross, lang }: { c: CrewCase; isCross: boolean; lang: Lang }) {
  if (c.link === "seed") {
    return <Badge color="var(--khaki)">{t("crew.link.seed", lang)}</Badge>;
  }
  if (c.link === "co-accused") {
    return <Badge color="var(--text-muted)">{t("crew.link.coAccused", lang)}</Badge>;
  }
  // Rank, not a percentage. The cosine behind an MO hop has no calibrated
  // meaning on this corpus (series pairs median .872, unrelated same-group pairs
  // median .835 — see SIMILAR_CASE_MIN_SCORE), and this dossier gets printed.
  // "#2" says what is true: the second-closest narrative to a case on the chain.
  const pos = c.linkRank != null ? ` #${c.linkRank}` : "";
  return (
    <Badge color={isCross ? "var(--red)" : "var(--text-muted)"}>
      {t("crew.link.mo", lang)}{pos}{isCross ? ` · ${t("crew.linkCrossDistrict", lang)}` : ""}
    </Badge>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded font-data font-bold whitespace-nowrap"
          style={{ color, border: `1px solid ${color}` }}>
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold tracking-widest uppercase font-data" style={{ color: "var(--red)" }}>
          {title}
        </span>
        <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
      </div>
      <div className="rounded-md p-3" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Print-only rendering — same browser-print route as the chat transcript, so a
 * dossier reaches a case file as paper without a PDF dependency. Several
 * .print-root elements can be mounted at once: the chat transcript's stays
 * mounted behind the drawer, and the crew view embeds a dossier while the case
 * drawer floats a second one over it. They all sit at the page origin, so the
 * marker classes below let globals.css pick exactly one to print — and a
 * floated dossier is the one the officer is looking at, so it beats an inline.
 */
function PrintDossier({ d, floating }: { d: Dossier; floating?: boolean }) {
  const s = d.summary;
  return (
    <div className={`print-root print-dossier${floating ? " print-dossier-float" : ""}`}>
      <div className="print-header">
        <strong>KHABRI AI</strong> · KSP Intelligence — Crew Dossier · {d.seed.label}
      </div>

      <div className="print-section">
        <div className="print-section-title">Summary</div>
        <div className="print-kv">
          Cases {s.cases} · Members {s.members} · Districts {s.districts} · Arrested {s.arrested} ·
          Chargesheeted {s.chargesheeted} · Open {s.open}
        </div>
        <div className="print-kv">Active {fmtDate(s.first)} to {fmtDate(s.last)}</div>
        <div className="print-kv">
          {d.crossDistrict
            ? `CROSSES DISTRICT BOUNDARIES — ${d.districts.join(", ")}`
            : `Contained within one district${d.districts[0] ? ` — ${d.districts[0]}` : ""}`}
        </div>
        {d.truncated && <div className="print-note">Walk stopped at the cap — the real network is larger.</div>}
      </div>

      {d.signature.length > 0 && (
        <div className="print-section">
          <div className="print-section-title">Signature</div>
          <div className="print-note">Details repeated across the crew&apos;s own FIR narratives.</div>
          {d.signature.map((p) => <div key={p} className="print-kv">• {p}</div>)}
        </div>
      )}

      <div className="print-section">
        <div className="print-section-title">Members ({d.members.length})</div>
        <table className="print-table">
          <thead>
            <tr><th>Name</th><th>Person ID</th><th>Age / gender</th><th>In crew</th><th>Total cases</th><th>Districts</th><th>Arrests</th></tr>
          </thead>
          <tbody>
            {d.members.map((m) => (
              <tr key={m.personId}>
                <td>{m.name}</td>
                <td>{m.personId}</td>
                <td>{m.age ?? "—"} / {m.gender ?? "—"}</td>
                <td>{m.casesInCrew}</td>
                <td>{m.totalCases}</td>
                <td>{m.districts.join(", ")}</td>
                <td>{m.arrests}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="print-section">
        <div className="print-section-title">Case timeline ({d.cases.length})</div>
        <table className="print-table">
          <thead>
            <tr><th>Date</th><th>Crime No.</th><th>Crime type</th><th>District / station</th><th>Status</th><th>Linked by</th></tr>
          </thead>
          <tbody>
            {d.cases.map((c) => (
              <tr key={c.id}>
                <td>{fmtDate(c.date)}</td>
                <td>{c.crimeNo}</td>
                <td>{c.crimeType ?? "—"}</td>
                <td>{[c.district, c.station].filter(Boolean).join(" / ") || "—"}</td>
                <td>{c.status ?? "—"}</td>
                <td>
                  {c.link === "seed" ? "Seed"
                    : c.link === "co-accused" ? "Co-accused"
                    : `Closest narrative${c.linkRank != null ? ` #${c.linkRank}` : ""}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
