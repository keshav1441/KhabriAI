"use client";
import { useEffect, useState } from "react";
import { STATUS_STYLE, CSTYPE } from "@/lib/caseStatus";
import { CrewDossier } from "../crew/CrewDossier";
// Type-only — lib/handover.ts reaches for the server Prisma client, so this
// import must never survive into the browser bundle.
import type { HandoverBrief as Brief, OutstandingItem, HandoverLinkedCase } from "@/lib/handover";
import { useChatStore } from "@/store/chat";
import { dateLocale, t, tf, tv } from "@/lib/i18n";

interface CaseData {
  case: Record<string, unknown>;
  victims: Record<string, unknown>[];
  accused: Record<string, unknown>[];
  arrests: Record<string, unknown>[];
  chargesheet: Record<string, unknown>[];
  actSections: Record<string, unknown>[];
}

type SimilarCase = { id: number; crimeNo: string | null; crimeType: string | null; district: string | null; station: string | null; status: string | null; registered: string | null; score: number; briefFacts: string | null };

type DuplicateReason = { signal: string; weight: number; label: string };
type DuplicateCase = { id: number; crimeNo: string | null; crimeType: string | null; district: string | null; station: string | null; status: string | null; registered: string | null; incident: string | null; sameStation: boolean; likelihood: number; reasons: DuplicateReason[] };

export function CaseDrawer({ caseId: requestedId, onClose }: { caseId: number | null; onClose: () => void }) {
  // The drawer can navigate between linked cases without the parent knowing.
  const [caseId, setCaseId] = useState<number | null>(requestedId);
  const [similar, setSimilar] = useState<SimilarCase[] | null>(null);
  const [dupes, setDupes] = useState<DuplicateCase[] | null>(null);
  useEffect(() => { setCaseId(requestedId); }, [requestedId]);
  // Every one of the three fetches below is cancelled on the way out. Walking a
  // chain of linked cases starts a new set before the previous one has landed,
  // and the header already shows the new id — a late answer for the old case
  // would fill the body with a file the officer has navigated away from.
  useEffect(() => {
    if (!caseId) { setSimilar(null); return; }
    let cancelled = false;
    setSimilar(null);
    fetch(`/api/case/similar?id=${caseId}`).then((r) => (r.ok ? r.json() : { cases: [] })).then((d) => { if (!cancelled) setSimilar(d.cases ?? []); }).catch(() => { if (!cancelled) setSimilar([]); });
    return () => { cancelled = true; };
  }, [caseId]);
  // Separate fetch from the MO one: a duplicate check is the opposite question
  // and must not be held up by, or hold up, the method search.
  useEffect(() => {
    if (!caseId) { setDupes(null); return; }
    let cancelled = false;
    setDupes(null);
    fetch(`/api/case/duplicates?id=${caseId}`).then((r) => (r.ok ? r.json() : { duplicates: [] })).then((d) => { if (!cancelled) setDupes(d.duplicates ?? []); }).catch(() => { if (!cancelled) setDupes([]); });
    return () => { cancelled = true; };
  }, [caseId]);
  const [data, setData] = useState<CaseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // One panel at a time, by construction. Both the crew dossier and the
  // handover brief mount a `.print-root`, and two of those printing at once
  // would interleave a dossier and a legal handover on the same page — so the
  // drawer cannot open both, rather than trusting itself to remember not to.
  const [panel, setPanel] = useState<"crew" | "handover" | null>(null);
  const lang = useChatStore((s) => s.lang);

  // Navigating to a linked case leaves a panel describing the previous one.
  useEffect(() => { setPanel(null); }, [caseId]);

  // /api/case answers a 404 for a case outside the officer's scope with a body
  // that carries no `case` key, so without the r.ok check the drawer rendered a
  // dialog with nothing in it and no reason given.
  useEffect(() => {
    if (!caseId) { setData(null); setError(""); return; }
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/case?id=${caseId}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok || !body?.case) throw new Error(body?.error || t("case.notFound", lang));
        return body as CaseData;
      })
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e: Error) => { if (!cancelled) { setData(null); setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
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
              <span className="badge-classified">{t("case.badge", lang)}</span>
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
              <span className="text-sm font-data">{t("case.loading", lang)}</span>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="px-5 py-16 text-center">
            <p className="text-sm font-data" style={{ color: "var(--red)" }}>{error}</p>
          </div>
        )}

        {!loading && data && c && (
          <div className="overflow-y-auto p-5 space-y-5 animate-fade-up" style={{ maxHeight: "calc(88vh - 72px)" }}>
            {/* Case info */}
            <Section title={t("case.section.info", lang)}>
              <Row label={t("case.crimeNo", lang)} value={c.crime_no} mono />
              <Row label={t("case.caseNo", lang)} value={c.case_no} mono />
              <Row label={t("case.registered", lang)}
                value={c.crimeregistereddate
                  ? new Date(c.crimeregistereddate as string).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                  : undefined}
              />
              <Row label={t("case.station", lang)} value={c.station} />
              <Row label={t("case.district", lang)} value={tv(c.district as string, lang)} />
              <Row label={t("case.crimeGroup", lang)} value={tv(c.crime_group as string, lang)} />
              <Row label={t("case.crimeType", lang)} value={c.crime_name} />
              <Row label={t("case.category", lang)} value={c.case_category} />
              <Row label={t("case.gravity", lang)}>
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
              <Row label={t("case.status", lang)}>
                {(() => {
                  const st = c.status as string;
                  const s = STATUS_STYLE[st] ?? { color: "var(--text-muted)", bg: "var(--bg-raised)" };
                  return (
                    <span className="text-xs px-2 py-0.5 rounded font-data font-bold" style={{ color: s.color, background: s.bg }}>
                      {tv(st, lang) || "—"}
                    </span>
                  );
                })()}
              </Row>
              <Row label={t("case.officer", lang)} value={c.officer_name} />
              <Row label={t("case.court", lang)} value={c.court} />
            </Section>

            {Boolean(c.brieffacts) && (
              <Section title={t("case.section.brief", lang)}>
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {c.brieffacts as string}
                </p>
              </Section>
            )}

            {similar && similar.length > 0 && (
              <Section title={`Similar Modus Operandi (${similar.length})`}>
                <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>
                  Cases whose narrative describes the same method - matched on the facts, not on names.
                </p>
                <div className="space-y-1.5">
                  {similar.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setCaseId(s.id)}
                      className="w-full text-left rounded px-2.5 py-2 transition-colors"
                      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-data text-xs" style={{ color: "var(--ink)" }}>{s.crimeNo ?? `#${s.id}`}</span>
                        <span className="font-data text-[11px]" style={{ color: s.district !== c.district ? "var(--red)" : "var(--text-muted)" }}>
                          {Math.round(s.score * 100)}% {s.district !== c.district ? "- other district" : ""}
                        </span>
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        {s.crimeType} - {s.district} - {s.registered} - {s.status}
                      </div>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {/* The mirror of the section above: not "same crew, other crimes"
                but "same crime, another file". Shown even when empty — an
                officer needs to know the check ran and came back clean. */}
            <Section title={dupes && dupes.length > 0 ? `${t("dup.title", lang)} (${dupes.length})` : t("dup.title", lang)}>
              {dupes === null && (
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t("dup.checking", lang)}</p>
              )}
              {dupes !== null && dupes.length === 0 && (
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t("dup.none", lang)}</p>
              )}
              {dupes !== null && dupes.length > 0 && (
                <div className="space-y-1.5">
                  {dupes.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setCaseId(d.id)}
                      title={t("dup.open", lang)}
                      className="w-full text-left rounded px-2.5 py-2 transition-colors"
                      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-data text-xs" style={{ color: "var(--ink)" }}>{d.crimeNo ?? `#${d.id}`}</span>
                        <span className="font-data text-[11px]" style={{ color: d.likelihood >= 0.8 ? "var(--red)" : "var(--text-muted)" }}>
                          {t("dup.likelihood", lang)} {Math.round(d.likelihood * 100)}%
                        </span>
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        {d.sameStation ? t("dup.sameStation", lang) : t("dup.otherStation", lang)} - {d.station ?? "—"} - {d.district} - {d.registered}
                      </div>
                      {d.reasons.length > 0 && (
                        <div className="mt-1.5">
                          <div className="text-[10px] uppercase tracking-wide font-data" style={{ color: "var(--text-muted)" }}>
                            {t("dup.why", lang)}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {d.reasons.map((r) => (
                              <span
                                key={r.signal}
                                className="text-[10px] px-1.5 py-0.5 rounded font-data"
                                style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                              >
                                {r.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </Section>

            {/* One MO hit is a lead; the crew walk is the series behind it. */}
            <button
              type="button"
              onClick={() => setPanel("crew")}
              className="w-full text-left rounded-md px-3 py-2.5 transition-all"
              style={{ background: "var(--khaki-dim)", border: "1px solid var(--khaki)" }}
            >
              <div className="text-xs font-bold font-data tracking-wide" style={{ color: "var(--khaki)" }}>
                {t("crew.build", lang)} →
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {t("crew.buildHint", lang)}
              </div>
            </button>

            {/* Everything above, plus the clock and the linked files, in the
                order the next officer needs to read them. */}
            <button
              type="button"
              onClick={() => setPanel("handover")}
              className="w-full text-left rounded-md px-3 py-2.5 transition-all"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
            >
              <div className="text-xs font-bold font-data tracking-wide" style={{ color: "var(--ink)" }}>
                {t("handover.build", lang)} →
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {t("handover.caveat", lang)}
              </div>
            </button>

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
              <Section title={t("case.section.chargesheet", lang)}>
                {data.chargesheet.map((cs, i) => (
                  <div key={i} className="py-1.5">
                    <Row label={t("case.type", lang)} value={CSTYPE[cs.cstype as string] ?? cs.cstype} />
                    <Row label={t("case.filedOn", lang)} value={cs.csdate ? new Date(cs.csdate as string).toLocaleDateString("en-IN") : undefined} />
                    <Row label={t("case.filedBy", lang)} value={cs.filed_by} />
                  </div>
                ))}
              </Section>
            )}
          </div>
        )}
        </div>{/* dialog */}
      </div>{/* backdrop */}

      {panel === "crew" && (
        <CrewDossier
          caseId={caseId}
          onClose={() => setPanel(null)}
          onOpenCase={(id) => { setPanel(null); setCaseId(id); }}
        />
      )}

      {panel === "handover" && (
        <HandoverPanel
          caseId={caseId}
          onClose={() => setPanel(null)}
          onOpenCase={(id) => { setPanel(null); setCaseId(id); }}
        />
      )}
    </>
  );
}

// ---- handover brief --------------------------------------------------------

const fmtDay = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/**
 * The handover brief, floated over the case file. Everything shown here comes
 * off the record via /api/handover — no sentence on this panel was written by
 * a model, which is why the caveat below is printed rather than tucked into a
 * tooltip: the officer signing off needs to know what they are reading.
 */
function HandoverPanel({ caseId, onClose, onOpenCase }: { caseId: number; onClose: () => void; onOpenCase: (id: number) => void }) {
  const lang = useChatStore((s) => s.lang);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setBrief(null);
    setError("");
    fetch(`/api/handover?caseId=${caseId}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || "");
        return body;
      })
      .then((body) => { if (!cancelled) setBrief(body.brief ?? null); })
      .catch((e: Error) => { if (!cancelled) setError(e.message || t("case.briefFailed", lang)); });
    return () => { cancelled = true; };
  }, [caseId]);

  const w = brief?.whatHappened;

  return (
    <div
      className="fixed inset-0 z-50 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full flex flex-col"
        style={{
          maxWidth: 720, maxHeight: "88vh", background: "var(--bg-surface)",
          border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)", overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 py-4 flex items-center justify-between"
             style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="badge-classified">{t("handover.title", lang)}</span>
            </div>
            <h2 className="font-bold tracking-tight truncate" style={{ color: "var(--text-primary)" }}>
              {brief?.crimeNo ?? `#${caseId}`}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => window.print()}
              disabled={!brief}
              className="text-xs font-medium px-3 py-1.5 rounded-md transition-all disabled:opacity-40"
              style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
              title={t("handover.print", lang)}
            >
              ↓ {t("handover.print", lang)}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-md flex items-center justify-center text-lg transition-all"
              style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
            >
              ×
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-5 space-y-5 animate-fade-up" style={{ maxHeight: "calc(88vh - 72px)" }}>
          {!brief && !error && (
            <p className="text-xs font-data py-10 text-center" style={{ color: "var(--text-muted)" }}>
              {t("handover.building", lang)}
            </p>
          )}
          {error && <p className="text-xs py-10 text-center" style={{ color: "var(--red)" }}>{error}</p>}

          {brief && w && (
            <>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t("handover.caveat", lang)}</p>

              <Section title={t("handover.whatHappened", lang)}>
                <Row label={t("case.crimeNo", lang)} value={brief.crimeNo} mono />
                <Row label={t("case.registered", lang)} value={fmtDay(brief.registered)} />
                <Row label={t("case.station", lang)} value={brief.station} />
                <Row label={t("case.district", lang)} value={tv(brief.district, lang)} />
                <Row label={t("case.offence", lang)} value={[tv(brief.crimeGroup, lang), brief.crimeType].filter(Boolean).join(" · ")} />
                <Row label={t("case.gravity", lang)} value={brief.gravity} />
                <Row label={t("case.status", lang)} value={tv(brief.status, lang)} />
                <Row label={t("case.court", lang)} value={brief.court} />
                <Row label={t("case.officer", lang)} value={brief.officer} />
                <Row label={t("case.sections", lang)} value={w.sections.map((s) => `${s.act} §${s.section}`).join(", ")} />
                <Row label={t("case.complainant", lang)} value={w.complainants.map((p) => p.name).join(", ")} />
                <Row label={t("case.victims", lang)} value={w.victims.map((p) => p.name).join(", ")} />
                <Row label={t("case.accused", lang)} value={w.accused.map((p) => p.name).join(", ")} />
                {w.narrative && (
                  <p className="text-xs leading-relaxed pt-2" style={{ color: "var(--text-secondary)" }}>{w.narrative}</p>
                )}
              </Section>

              <Section title={t("handover.doneSoFar", lang)}>
                {brief.doneSoFar.arrests.length === 0 && brief.doneSoFar.chargesheets.length === 0 && (
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t("case.noAction", lang)}</p>
                )}
                {brief.doneSoFar.arrests.map((a, i) => (
                  <Row key={`a${i}`} label={a.name ?? t("case.arrest", lang)} value={`${fmtDay(a.date)}${a.district ? ` · ${a.district}` : ""}`} />
                ))}
                {brief.doneSoFar.chargesheets.map((cs, i) => (
                  <Row key={`c${i}`} label={cs.type ?? t("case.section.chargesheet", lang)} value={`${fmtDay(cs.date)}${cs.filedBy ? ` · ${cs.filedBy}` : ""}`} />
                ))}
              </Section>

              <Section title={t("handover.outstanding", lang)}>
                {brief.clock && !brief.doneSoFar.chargesheetFiled && (
                  <Row
                    label={t("handover.deadline", lang)}
                    value={
                      brief.clock.state === "overdue"
                        ? `${brief.clock.daysOverdue} days overdue (${brief.clock.limitDays}-day limit, ${brief.clock.basis})`
                        : `${brief.clock.daysRemaining} days left (${brief.clock.limitDays}-day limit, ${brief.clock.basis})`
                    }
                  />
                )}
                <ul className="space-y-1 pt-1">
                  {brief.outstanding.items.map((o: OutstandingItem, i) => (
                    <li key={i} className="text-xs leading-relaxed"
                        style={{ color: o.severity === "urgent" ? "var(--red)" : "var(--text-secondary)" }}>
                      • {o.label}
                    </li>
                  ))}
                </ul>
              </Section>

              <Section title={t("handover.linked", lang)}>
                <LinkedList rows={brief.linked.moMatches} heading={t("case.linked.method", lang)} onOpenCase={onOpenCase} />
                <LinkedList rows={brief.linked.crew?.cases ?? []} heading={t("case.linked.crew", lang)} onOpenCase={onOpenCase} />
                <LinkedList rows={brief.linked.duplicates} heading={t("case.linked.dup", lang)} onOpenCase={onOpenCase} />
                {brief.linked.moMatches.length === 0 &&
                  !brief.linked.crew?.cases.length &&
                  brief.linked.duplicates.length === 0 && (
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t("case.noLinked", lang)}</p>
                  )}
              </Section>
            </>
          )}
        </div>
      </div>

      {brief && <PrintHandover brief={brief} caveat={t("handover.caveat", lang)} />}
    </div>
  );
}

function LinkedList({ rows, heading, onOpenCase }: { rows: HandoverLinkedCase[]; heading: string; onOpenCase: (id: number) => void }) {
  if (!rows.length) return null;
  return (
    <div className="pt-1">
      <div className="text-[10px] uppercase tracking-wide font-data mb-1" style={{ color: "var(--text-muted)" }}>{heading}</div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <button
            key={`${heading}-${r.id}`}
            type="button"
            onClick={() => onOpenCase(r.id)}
            className="w-full text-left rounded px-2.5 py-2"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
          >
            <div className="font-data text-xs" style={{ color: "var(--ink)" }}>{r.crimeNo ?? `#${r.id}`}</div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {[r.crimeType, r.district, r.date, r.status].filter(Boolean).join(" · ")}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{r.why}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Print-only rendering — the same browser-print route as the chat transcript
 * and the crew dossier, so a brief reaches a case file as paper without a PDF
 * dependency. The drawer can only ever have one panel open, and the extra
 * `.print-handover` class lets globals.css suppress any other `.print-root`
 * that happens to be mounted elsewhere on the page.
 */
function PrintHandover({ brief, caveat }: { brief: Brief; caveat: string }) {
  const lang = useChatStore((s) => s.lang);
  const w = brief.whatHappened;
  const linkedRows = (rows: HandoverLinkedCase[], heading: string) =>
    rows.length ? (
      <div className="print-section">
        <div className="print-section-title">{heading}</div>
        {rows.map((r) => (
          <div key={`${heading}-${r.id}`} className="print-kv">
            {r.crimeNo ?? `#${r.id}`} — {[r.crimeType, r.district, r.date, r.status].filter(Boolean).join(" · ")} — {r.why}
          </div>
        ))}
      </div>
    ) : null;

  return (
    <div className="print-root print-handover">
      <div className="print-header">
        <strong>KHABRI AI</strong> · {t("case.print.header", lang)} · {brief.crimeNo ?? `#${brief.caseId}`}
      </div>
      <div className="print-note">{caveat} {tf("case.print.assembled", lang, { when: new Date(brief.generatedAt).toLocaleString(dateLocale(lang)) })}</div>

      <div className="print-section">
        <div className="print-section-title">{t("handover.whatHappened", lang)}</div>
        <div className="print-kv">{t("case.crimeNo", lang)} {brief.crimeNo ?? "—"} · {t("case.caseNo", lang)} {brief.caseNo ?? "—"} · {t("case.registered", lang)} {fmtDay(brief.registered)}</div>
        <div className="print-kv">{[brief.station, brief.district].filter(Boolean).join(" · ") || "—"}</div>
        <div className="print-kv">{t("case.offence", lang)} {[tv(brief.crimeGroup, lang), brief.crimeType].filter(Boolean).join(" · ") || "—"} · {t("case.gravity", lang)} {brief.gravity ?? "—"} · {t("case.status", lang)} {tv(brief.status, lang) || "—"}</div>
        <div className="print-kv">{t("case.court", lang)} {brief.court ?? "—"} · {t("case.officer", lang)} {brief.officer ?? "—"}</div>
        <div className="print-kv">{t("case.sections", lang)} {w.sections.map((s) => `${s.act} §${s.section}`).join(", ") || "—"}</div>
        <div className="print-kv">{t("case.complainant", lang)} {w.complainants.map((p) => p.name).join(", ") || "—"}</div>
        <div className="print-kv">{t("case.victims", lang)} {w.victims.map((p) => p.name).join(", ") || "—"}</div>
        <div className="print-kv">{t("case.accused", lang)} {w.accused.map((p) => p.name).join(", ") || "—"}</div>
        {w.narrative && <div className="print-content">{w.narrative}</div>}
      </div>

      <div className="print-section">
        <div className="print-section-title">{t("handover.doneSoFar", lang)}</div>
        {brief.doneSoFar.arrests.length === 0 && brief.doneSoFar.chargesheets.length === 0 && (
          <div className="print-kv">{t("case.noAction", lang)}</div>
        )}
        {brief.doneSoFar.arrests.map((a, i) => (
          <div key={`a${i}`} className="print-kv">{t("case.print.arrest", lang)} — {a.name ?? "—"} · {fmtDay(a.date)}{a.district ? ` · ${a.district}` : ""}</div>
        ))}
        {brief.doneSoFar.chargesheets.map((cs, i) => (
          <div key={`c${i}`} className="print-kv">{cs.type ?? t("case.section.chargesheet", lang)} — {fmtDay(cs.date)}{cs.filedBy ? ` · ${cs.filedBy}` : ""}</div>
        ))}
      </div>

      <div className="print-section">
        <div className="print-section-title">{t("handover.outstanding", lang)}</div>
        {brief.clock && !brief.doneSoFar.chargesheetFiled && (
          <div className="print-kv">
            {t("handover.deadline", lang)} —{" "}
            {brief.clock.state === "overdue"
              ? tf("case.print.overdue", lang, { n: brief.clock.daysOverdue })
              : tf("case.print.left", lang, { n: brief.clock.daysRemaining })}{" "}
            {tf("case.print.limit", lang, { n: brief.clock.limitDays, basis: brief.clock.basis })}
          </div>
        )}
        {brief.outstanding.items.map((o, i) => <div key={i} className="print-kv">• {o.label}</div>)}
      </div>

      {linkedRows(brief.linked.moMatches, t("case.print.method", lang))}
      {linkedRows(brief.linked.crew?.cases ?? [], t("case.print.crew", lang))}
      {linkedRows(brief.linked.duplicates, t("case.print.dup", lang))}
    </div>
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
