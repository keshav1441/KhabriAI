"use client";
import { useEffect, useState } from "react";

interface CaseData {
  case: Record<string, unknown>;
  victims: Record<string, unknown>[];
  accused: Record<string, unknown>[];
  arrests: Record<string, unknown>[];
  chargesheet: Record<string, unknown>[];
  actSections: Record<string, unknown>[];
}

const CSTYPE: Record<string, string> = { A: "Chargesheet Filed", B: "False Case", C: "Undetected" };

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  "Under Investigation": { color: "var(--amber)", bg: "var(--amber-dim)" },
  "Charge Sheeted":      { color: "var(--blue)",  bg: "rgba(59,130,246,0.12)" },
  "Closed":              { color: "var(--green)",  bg: "var(--green-dim)" },
  "False Case":          { color: "var(--red)",    bg: "var(--red-dim)" },
};

export function CaseDrawer({ caseId, onClose }: { caseId: number | null; onClose: () => void }) {
  const [data, setData] = useState<CaseData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!caseId) { setData(null); return; }
    setLoading(true);
    fetch(`/api/case?id=${caseId}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [caseId]);

  if (!caseId) return null;

  const c = data?.case;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 backdrop-blur-sm flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.55)" }}
        onClick={onClose}
      >
        {/* Dialog — stopPropagation so clicking inside doesn't close */}
        <div
          className="relative w-full flex flex-col"
          style={{
            maxWidth: 600,
            maxHeight: "88vh",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
            overflow: "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
        >
        {/* Header */}
        <div
          className="shrink-0 px-5 py-4 flex items-center justify-between"
          style={{
            background: "var(--bg-surface)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="badge-classified">CASE FILE</span>
              <span className="font-data text-xs" style={{ color: "var(--text-muted)" }}>
                #{caseId}
              </span>
            </div>
            {loading ? (
              <span className="inline-block h-5 w-32 rounded animate-pulse" style={{ background: "var(--bg-raised)" }} />
            ) : (
              <h2 className="font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                {(c?.crime_no as string) || `Case #${caseId}`}
              </h2>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md flex items-center justify-center text-lg transition-all"
            style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--red)"; (e.currentTarget as HTMLElement).style.color = "var(--red)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
          >
            ×
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3" style={{ color: "var(--text-muted)" }}>
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0110 10" stroke="var(--red)" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <span className="text-sm font-data">Retrieving case file…</span>
            </div>
          </div>
        )}

        {!loading && data && c && (
          <div className="overflow-y-auto p-5 space-y-5 animate-fade-up" style={{ maxHeight: "calc(88vh - 72px)" }}>
            {/* Case info */}
            <Section title="Case Information">
              <Row label="Crime No." value={c.crime_no} mono />
              <Row label="Case No." value={c.case_no} mono />
              <Row label="Registered"
                value={c.crimeregistereddate
                  ? new Date(c.crimeregistereddate as string).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                  : undefined}
              />
              <Row label="Station" value={c.station} />
              <Row label="District" value={c.district} />
              <Row label="Crime Group" value={c.crime_group} />
              <Row label="Crime Type" value={c.crime_name} />
              <Row label="Category" value={c.case_category} />
              <Row label="Gravity">
                <span
                  className="text-xs px-2 py-0.5 rounded font-data font-bold"
                  style={
                    (c.gravity as string) === "Heinous"
                      ? { color: "var(--red)", background: "var(--red-dim)" }
                      : { color: "var(--text-secondary)", background: "var(--bg-raised)" }
                  }
                >
                  {(c.gravity as string) || "—"}
                </span>
              </Row>
              <Row label="Status">
                {(() => {
                  const st = c.status as string;
                  const s = STATUS_STYLE[st] ?? { color: "var(--text-muted)", bg: "var(--bg-raised)" };
                  return (
                    <span className="text-xs px-2 py-0.5 rounded font-data font-bold" style={{ color: s.color, background: s.bg }}>
                      {st || "—"}
                    </span>
                  );
                })()}
              </Row>
              <Row label="Officer" value={c.officer_name} />
              <Row label="Court" value={c.court} />
            </Section>

            {Boolean(c.brieffacts) && (
              <Section title="Brief Facts">
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {c.brieffacts as string}
                </p>
              </Section>
            )}

            {data.actSections.length > 0 && (
              <Section title={`Sections Charged (${data.actSections.length})`}>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {data.actSections.map((s, i) => (
                    <span
                      key={i}
                      className="text-xs px-2 py-0.5 rounded font-data"
                      style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                    >
                      {s.ActCode as string} §{s.SectionCode as string}
                      {s.SectionDescription ? ` — ${s.SectionDescription}` : ""}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {data.victims.length > 0 && (
              <Section title={`Victims (${data.victims.length})`}>
                {data.victims.map((v, i) => (
                  <div key={i} className="flex justify-between py-1.5" style={{ borderBottom: i < data.victims.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                    <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{v.VictimName as string}</span>
                    <span className="text-xs font-data" style={{ color: "var(--text-muted)" }}>{v.gender as string} · {v.AgeYear as number} yrs</span>
                  </div>
                ))}
              </Section>
            )}

            {data.accused.length > 0 && (
              <Section title={`Accused (${data.accused.length})`}>
                {data.accused.map((a, i) => (
                  <div key={i} className="flex justify-between py-1.5" style={{ borderBottom: i < data.accused.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                    <span className="text-xs font-bold" style={{ color: "var(--red)" }}>{a.AccusedName as string}</span>
                    <span className="text-xs font-data" style={{ color: "var(--text-muted)" }}>{a.gender as string} · {a.AgeYear as number} yrs</span>
                  </div>
                ))}
              </Section>
            )}

            {data.arrests.length > 0 && (
              <Section title={`Arrests (${data.arrests.length})`}>
                {data.arrests.map((ar, i) => (
                  <div key={i} className="py-1.5" style={{ borderBottom: i < data.arrests.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                    <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{ar.AccusedName as string}</p>
                    <p className="text-xs mt-0.5 font-data" style={{ color: "var(--text-muted)" }}>
                      {ar.ArrestSurrenderDate ? new Date(ar.ArrestSurrenderDate as string).toLocaleDateString("en-IN") : "—"}
                      {ar.arrest_district ? ` · ${ar.arrest_district}` : ""}
                    </p>
                  </div>
                ))}
              </Section>
            )}

            {data.chargesheet.length > 0 && (
              <Section title="Chargesheet">
                {data.chargesheet.map((cs, i) => (
                  <div key={i} className="py-1.5">
                    <Row label="Type" value={CSTYPE[cs.cstype as string] ?? cs.cstype} />
                    <Row label="Filed On" value={cs.csdate ? new Date(cs.csdate as string).toLocaleDateString("en-IN") : undefined} />
                    <Row label="Filed By" value={cs.filed_by} />
                  </div>
                ))}
              </Section>
            )}
          </div>
        )}
        </div>{/* dialog */}
      </div>{/* backdrop */}
    </>
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
      <div className="rounded-md p-3 space-y-1" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, mono, children }: { label: string; value?: unknown; mono?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 py-0.5">
      <span className="text-xs shrink-0 tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</span>
      {children ?? (
        <span
          className={`text-xs text-right ${mono ? "font-data" : ""}`}
          style={{ color: value != null && value !== "" ? "var(--text-primary)" : "var(--text-muted)" }}
        >
          {value != null && value !== "" ? String(value) : "—"}
        </span>
      )}
    </div>
  );
}
