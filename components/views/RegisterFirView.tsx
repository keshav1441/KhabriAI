"use client";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { CaseDrawer } from "../viz/CaseDrawer";
import { useChatStore } from "@/store/chat";
import { t, type StringKey } from "@/lib/i18n";
import { MAX_ROWS } from "@/lib/fir";

type Lookups = {
  districts: { DistrictID: number; DistrictName: string; units: { UnitID: number; UnitName: string }[] }[];
  crimeHeads: { CrimeHeadID: number; CrimeGroupName: string; subHeads: { CrimeSubHeadID: number; CrimeHeadName: string }[]; actSections: { ActCode: string }[] }[];
  categories: { CaseCategoryID: number; LookupValue: string }[];
  gravity: { GravityOffenceID: number; LookupValue: string }[];
  courts: { CourtID: number; CourtName: string; DistrictID: number | null }[];
  sections: { ActCode: string; SectionCode: string; SectionDescription: string | null }[];
};

type PersonRow = { name: string; ageYear: string; genderId: string; personId?: string };
const blankPerson = (): PersonRow => ({ name: "", ageYear: "", genderId: "" });
// Local calendar date, not UTC — at 03:00 IST toISOString() still says "yesterday".
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

const initialForm = () => ({
  districtId: "", policeStationId: "", crimeMajorHeadId: "", crimeMinorHeadId: "",
  crimeRegisteredDate: today(), incidentFromDate: "", caseCategoryId: "", gravityOffenceId: "", courtId: "",
  latitude: "", longitude: "", briefFacts: "",
  complainant: blankPerson(), accused: [blankPerson()] as PersonRow[], victims: [] as PersonRow[],
  sections: [] as string[], // "ACT|SECTION"
});
type Form = ReturnType<typeof initialForm>;

const num = (s: string) => (s === "" ? undefined : Number(s));
const toPerson = (p: PersonRow) => ({ name: p.name, ageYear: num(p.ageYear), genderId: num(p.genderId), ...(p.personId ? { personId: p.personId } : {}) });

const inputStyle: CSSProperties = { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" };
const focus = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--ink)"; };
const blur = (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--border)"; };
const inputClass = "w-full px-2.5 py-1.5 text-xs rounded-md outline-none transition-all";

export function RegisterFirView({ onAskAssistant }: { onAskAssistant: () => void }) {
  const lang = useChatStore((s) => s.lang);
  const setDraft = useChatStore((s) => s.setDraft);
  const L = (k: StringKey) => t(k, lang);

  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState<Form>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ caseMasterId: number; crimeNo: string } | null>(null);
  const [openCaseId, setOpenCaseId] = useState<number | null>(null);

  const loadLookups = () => {
    setLoadError(false);
    fetch("/api/lookups").then((r) => (r.ok ? r.json() : Promise.reject(r))).then(setLookups).catch(() => setLoadError(true));
  };
  useEffect(loadLookups, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setRows = (k: "accused" | "victims", rows: PersonRow[]) => set(k, rows);

  const district = lookups?.districts.find((d) => String(d.DistrictID) === form.districtId);
  const head = lookups?.crimeHeads.find((h) => String(h.CrimeHeadID) === form.crimeMajorHeadId);
  const courts = lookups?.courts.filter((c) => !form.districtId || String(c.DistrictID) === form.districtId) ?? [];
  // ponytail: filter the section list to the acts linked to the chosen crime group; full list until one is picked.
  const relevantActs = new Set(head?.actSections.map((a) => a.ActCode) ?? []);
  const sections = lookups?.sections.filter((s) => relevantActs.size === 0 || relevantActs.has(s.ActCode)) ?? [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = {
        policeStationId: num(form.policeStationId),
        crimeMajorHeadId: num(form.crimeMajorHeadId),
        crimeMinorHeadId: num(form.crimeMinorHeadId),
        crimeRegisteredDate: form.crimeRegisteredDate,
        incidentFromDate: form.incidentFromDate || undefined,
        caseCategoryId: num(form.caseCategoryId),
        gravityOffenceId: num(form.gravityOffenceId),
        courtId: num(form.courtId),
        latitude: num(form.latitude),
        longitude: num(form.longitude),
        briefFacts: form.briefFacts,
        complainant: toPerson(form.complainant),
        accused: form.accused.map(toPerson),
        victims: form.victims.map(toPerson),
        sections: form.sections.map((s) => { const [actCode, sectionCode] = s.split("|"); return { actCode, sectionCode }; }),
      };
      const res = await fetch("/api/cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? `HTTP ${res.status}`); return; }
      setDone(data);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => { setForm(initialForm()); setDone(null); setError(null); };

  if (loadError) {
    return (
      <Centered>
        <span className="text-sm" style={{ color: "var(--red)" }}>{L("fir.loadFailed")}</span>
        <button type="button" onClick={loadLookups} className="text-xs font-medium px-3 py-1.5 rounded-md" style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>{L("fir.retry")}</button>
      </Centered>
    );
  }
  if (!lookups) return <Centered><span className="text-sm animate-pulse" style={{ color: "var(--text-muted)" }}>{L("fir.loading")}</span></Centered>;

  if (done) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto w-full" style={{ maxWidth: 760 }}>
          <div className="rounded-md p-5" style={{ background: "var(--green-dim)", border: "1px solid var(--green)" }}>
            <div className="font-data text-xs font-bold tracking-widest uppercase" style={{ color: "var(--green)" }}>{L("fir.success")}</div>
            <div className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>{L("fir.crimeNo")}</div>
            <div className="font-data text-xl font-bold" style={{ color: "var(--text-primary)" }}>{done.crimeNo}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setOpenCaseId(done.caseMasterId)} className="text-xs font-bold px-3 py-1.5 rounded-md" style={{ background: "var(--ink)", color: "var(--bg-input)", border: "1px solid var(--ink)" }}>
                {L("fir.openCase")} ↗
              </button>
              <button type="button" onClick={() => { setDraft(`Tell me about case ${done.crimeNo}`); onAskAssistant(); }} className="text-xs font-medium px-3 py-1.5 rounded-md" style={{ color: "var(--ink)", border: "1px solid var(--ink)", background: "var(--ink-dim)" }}>
                {L("fir.askAssistant")} →
              </button>
              <button type="button" onClick={reset} className="text-xs font-medium px-3 py-1.5 rounded-md" style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                {L("fir.registerAnother")}
              </button>
            </div>
          </div>
        </div>
        <CaseDrawer caseId={openCaseId} onClose={() => setOpenCaseId(null)} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <form onSubmit={submit} className="mx-auto w-full space-y-5" style={{ maxWidth: 760 }}>
        <div>
          <h2 className="font-display font-bold" style={{ color: "var(--text-primary)", fontSize: "1.15rem" }}>{L("fir.title")}</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{L("fir.subtitle")}</p>
        </div>

        <Section title={L("fir.sec.jurisdiction")}>
          <Grid>
            <Field label={L("fir.district")}>
              <select required className={inputClass} style={inputStyle} onFocus={focus} onBlur={blur} value={form.districtId}
                onChange={(e) => setForm((f) => ({ ...f, districtId: e.target.value, policeStationId: "", courtId: "" }))}>
                <option value="">{L("fir.select")}</option>
                {lookups.districts.map((d) => <option key={d.DistrictID} value={d.DistrictID}>{d.DistrictName}</option>)}
              </select>
            </Field>
            <Field label={L("fir.station")}>
              <select required className={inputClass} style={inputStyle} onFocus={focus} onBlur={blur} value={form.policeStationId} disabled={!district} onChange={(e) => set("policeStationId", e.target.value)}>
                <option value="">{L("fir.select")}</option>
                {district?.units.map((u) => <option key={u.UnitID} value={u.UnitID}>{u.UnitName}</option>)}
              </select>
            </Field>
            <Field label={L("fir.court")} optional={L("fir.optional")}>
              <select className={inputClass} style={inputStyle} onFocus={focus} onBlur={blur} value={form.courtId} onChange={(e) => set("courtId", e.target.value)}>
                <option value="">{L("fir.select")}</option>
                {courts.map((c) => <option key={c.CourtID} value={c.CourtID}>{c.CourtName}</option>)}
              </select>
            </Field>
          </Grid>
        </Section>

        <Section title={L("fir.sec.offence")}>
          <Grid>
            <Field label={L("fir.crimeGroup")}>
              <select required className={inputClass} style={inputStyle} onFocus={focus} onBlur={blur} value={form.crimeMajorHeadId}
                onChange={(e) => setForm((f) => ({ ...f, crimeMajorHeadId: e.target.value, crimeMinorHeadId: "", sections: [] }))}>
                <option value="">{L("fir.select")}</option>
                {lookups.crimeHeads.map((h) => <option key={h.CrimeHeadID} value={h.CrimeHeadID}>{h.CrimeGroupName}</option>)}
              </select>
            </Field>
            <Field label={L("fir.crime")}>
              <select required className={inputClass} style={inputStyle} onFocus={focus} onBlur={blur} value={form.crimeMinorHeadId} disabled={!head} onChange={(e) => set("crimeMinorHeadId", e.target.value)}>
                <option value="">{L("fir.select")}</option>
                {head?.subHeads.map((s) => <option key={s.CrimeSubHeadID} value={s.CrimeSubHeadID}>{s.CrimeHeadName}</option>)}
              </select>
            </Field>
            <Field label={L("fir.registeredDate")}>
              <input type="date" required max={today()} className={`${inputClass} font-data`} style={inputStyle} onFocus={focus} onBlur={blur} value={form.crimeRegisteredDate} onChange={(e) => set("crimeRegisteredDate", e.target.value)} />
            </Field>
            <Field label={L("fir.incidentDate")} optional={L("fir.optional")}>
              <input type="date" max={form.crimeRegisteredDate || today()} className={`${inputClass} font-data`} style={inputStyle} onFocus={focus} onBlur={blur} value={form.incidentFromDate} onChange={(e) => set("incidentFromDate", e.target.value)} />
            </Field>
            <Field label={L("fir.category")} optional={L("fir.optional")}>
              <select className={inputClass} style={inputStyle} onFocus={focus} onBlur={blur} value={form.caseCategoryId} onChange={(e) => set("caseCategoryId", e.target.value)}>
                <option value="">{L("fir.select")}</option>
                {lookups.categories.map((c) => <option key={c.CaseCategoryID} value={c.CaseCategoryID}>{c.LookupValue}</option>)}
              </select>
            </Field>
            <Field label={L("fir.gravity")} optional={L("fir.optional")}>
              <select className={inputClass} style={inputStyle} onFocus={focus} onBlur={blur} value={form.gravityOffenceId} onChange={(e) => set("gravityOffenceId", e.target.value)}>
                <option value="">{L("fir.select")}</option>
                {lookups.gravity.map((g) => <option key={g.GravityOffenceID} value={g.GravityOffenceID}>{g.LookupValue}</option>)}
              </select>
            </Field>
            <Field label={L("fir.latitude")} optional={L("fir.optional")}>
              <input type="number" step="any" min={-90} max={90} className={`${inputClass} font-data`} style={inputStyle} onFocus={focus} onBlur={blur} value={form.latitude} onChange={(e) => set("latitude", e.target.value)} placeholder="12.9716" />
            </Field>
            <Field label={L("fir.longitude")} optional={L("fir.optional")}>
              <input type="number" step="any" min={-180} max={180} className={`${inputClass} font-data`} style={inputStyle} onFocus={focus} onBlur={blur} value={form.longitude} onChange={(e) => set("longitude", e.target.value)} placeholder="77.5946" />
            </Field>
          </Grid>
        </Section>

        <Section title={L("fir.sec.facts")}>
          <Field label={L("fir.briefFacts")}>
            <textarea required minLength={20} maxLength={4000} rows={5} className={inputClass} style={{ ...inputStyle, resize: "vertical" }} onFocus={focus} onBlur={blur} value={form.briefFacts} onChange={(e) => set("briefFacts", e.target.value)} />
          </Field>
        </Section>

        <Section title={L("fir.sec.complainant")}>
          <PersonFields row={form.complainant} onChange={(r) => set("complainant", r)} L={L} required />
        </Section>

        <Section title={L("fir.sec.accused")} hint={L("fir.maxRows")}>
          <RowList rows={form.accused} onChange={(rows) => setRows("accused", rows)} L={L} withPersonId min={1} />
        </Section>

        <Section title={L("fir.sec.victims")} hint={L("fir.maxRows")}>
          <RowList rows={form.victims} onChange={(rows) => setRows("victims", rows)} L={L} min={0} />
        </Section>

        <Section title={L("fir.sec.sections")} hint={L("fir.maxRows")}>
          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {sections.map((s) => {
              const key = `${s.ActCode}|${s.SectionCode}`;
              const checked = form.sections.includes(key);
              const full = !checked && form.sections.length >= MAX_ROWS;
              return (
                <label key={key} className="flex items-start gap-2 text-xs px-2 py-1 rounded-md" style={{ color: full ? "var(--text-muted)" : "var(--text-primary)", background: checked ? "var(--ink-dim)" : "transparent", cursor: full ? "not-allowed" : "pointer" }}>
                  <input type="checkbox" className="mt-0.5" checked={checked} disabled={full}
                    onChange={(e) => set("sections", e.target.checked ? [...form.sections, key] : form.sections.filter((k) => k !== key))} />
                  <span><span className="font-data font-bold">{s.ActCode} {s.SectionCode}</span>{s.SectionDescription ? <span style={{ color: "var(--text-secondary)" }}> · {s.SectionDescription}</span> : null}</span>
                </label>
              );
            })}
          </div>
        </Section>

        {error && (
          <div role="alert" className="rounded-md px-3 py-2 text-xs" style={{ background: "var(--red-dim)", border: "1px solid var(--red)", color: "var(--red)" }}>
            <span className="font-bold">{L("fir.error")}:</span> {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1" style={{ borderTop: "1px solid var(--border)" }}>
          <button type="button" onClick={reset} className="text-xs font-medium px-3 py-1.5 rounded-md mt-3" style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>{L("fir.reset")}</button>
          <button type="submit" disabled={submitting} className="text-xs font-bold px-4 py-1.5 rounded-md mt-3" style={{ background: "var(--ink)", color: "var(--bg-input)", border: "1px solid var(--ink)", opacity: submitting ? 0.6 : 1 }}>
            {submitting ? L("fir.submitting") : L("fir.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Small layout pieces ─────────────────────────────────────────── */
function Centered({ children }: { children: ReactNode }) {
  return <div className="flex-1 flex flex-col items-center justify-center gap-3 h-40">{children}</div>;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-md p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-xs font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>{title}</h3>
        {hint && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>{children}</div>;
}

function Field({ label, optional, children }: { label: string; optional?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
        {label}{optional && <span style={{ color: "var(--text-muted)" }}> · {optional}</span>}
      </span>
      {children}
    </label>
  );
}

function PersonFields({ row, onChange, L, required, withPersonId }: {
  row: PersonRow; onChange: (r: PersonRow) => void; L: (k: StringKey) => string; required?: boolean; withPersonId?: boolean;
}) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: withPersonId ? "2fr 1fr 1fr 1.4fr" : "2fr 1fr 1fr" }}>
      <Field label={L("fir.name")}>
        <input type="text" required={required} maxLength={120} className={inputClass} style={inputStyle} onFocus={focus} onBlur={blur} value={row.name} onChange={(e) => onChange({ ...row, name: e.target.value })} />
      </Field>
      <Field label={L("fir.age")}>
        <input type="number" min={0} max={120} className={`${inputClass} font-data`} style={inputStyle} onFocus={focus} onBlur={blur} value={row.ageYear} onChange={(e) => onChange({ ...row, ageYear: e.target.value })} />
      </Field>
      <Field label={L("fir.gender")}>
        <select className={inputClass} style={inputStyle} onFocus={focus} onBlur={blur} value={row.genderId} onChange={(e) => onChange({ ...row, genderId: e.target.value })}>
          <option value="">{L("fir.select")}</option>
          <option value="1">{L("fir.gender.male")}</option>
          <option value="2">{L("fir.gender.female")}</option>
          <option value="3">{L("fir.gender.other")}</option>
        </select>
      </Field>
      {withPersonId && (
        <Field label={L("fir.personId")}>
          <input type="text" maxLength={40} className={`${inputClass} font-data`} style={inputStyle} onFocus={focus} onBlur={blur} value={row.personId ?? ""} placeholder="KSP-P-00001" onChange={(e) => onChange({ ...row, personId: e.target.value })} />
        </Field>
      )}
    </div>
  );
}

function RowList({ rows, onChange, L, withPersonId, min }: {
  rows: PersonRow[]; onChange: (rows: PersonRow[]) => void; L: (k: StringKey) => string; withPersonId?: boolean; min: number;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="flex-1">
            <PersonFields row={row} onChange={(r) => onChange(rows.map((x, j) => (j === i ? r : x)))} L={L} required withPersonId={withPersonId} />
          </div>
          <button type="button" disabled={rows.length <= min} title={L("fir.remove")} onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="shrink-0 text-xs px-2 py-1.5 rounded-md" style={{ color: "var(--red)", border: "1px solid var(--border)", opacity: rows.length <= min ? 0.4 : 1 }}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" disabled={rows.length >= MAX_ROWS} onClick={() => onChange([...rows, blankPerson()])}
        className="text-xs font-medium px-3 py-1.5 rounded-md" style={{ color: "var(--ink)", border: "1px dashed var(--ink)", opacity: rows.length >= MAX_ROWS ? 0.4 : 1 }}>
        {L("fir.addRow")}
      </button>
    </div>
  );
}
