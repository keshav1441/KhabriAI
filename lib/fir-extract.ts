// Turns the text of an FIR document into a *draft* of the Register-FIR form.
// Nothing here registers anything: the officer reviews every field and presses
// Register, which still goes through validateFirInput + createCase untouched.
//
// ponytail: the model is only ever allowed to quote the document. Every quote is
// checked back against the source text and every id is resolved against the real
// lookup tables — a hallucinated "Mysuru East PS" would silently file the FIR at
// the wrong station, so an unresolvable value is dropped, never approximated.

import { getLlmClient } from "./mistral-client";
import { resolveLiterals, similarNames, similarity, type Vocab } from "./entity-resolve";
import { MAX_ROWS } from "./fir";

const EXTRACT_MODEL = process.env.MISTRAL_EXTRACT_MODEL ?? "mistral-large-latest";

/** Documents longer than this are truncated before they reach the model. */
export const MAX_DOC_CHARS = 20_000;

export type PersonDraft = { name: string; ageYear: string; genderId: string; personId?: string };

/** Mirror of the Register-FIR form state — all strings, exactly what the inputs bind to. */
export type ExtractedForm = {
  districtId: string;
  policeStationId: string;
  crimeMajorHeadId: string;
  crimeMinorHeadId: string;
  crimeRegisteredDate: string;
  incidentFromDate: string;
  caseCategoryId: string;
  gravityOffenceId: string;
  courtId: string;
  latitude: string;
  longitude: string;
  briefFacts: string;
  complainant: PersonDraft;
  accused: PersonDraft[];
  victims: PersonDraft[];
  sections: string[]; // "ACT|SECTION"
};

export type ExtractLookups = {
  districts: { DistrictID: number; DistrictName: string; units: { UnitID: number; UnitName: string }[] }[];
  crimeHeads: { CrimeHeadID: number; CrimeGroupName: string; subHeads: { CrimeSubHeadID: number; CrimeHeadName: string }[] }[];
  categories: { CaseCategoryID: number; LookupValue: string }[];
  gravity: { GravityOffenceID: number; LookupValue: string }[];
  courts: { CourtID: number; CourtName: string; DistrictID: number | null }[];
  sections: { ActCode: string; SectionCode: string }[];
};

/** What the model is allowed to return: verbatim quotes or null. Never an id. */
export type RawPerson = { name?: unknown; age?: unknown; gender?: unknown };
export type RawExtraction = {
  district?: unknown; policeStation?: unknown; crimeGroup?: unknown; crime?: unknown;
  registeredDate?: unknown; incidentDate?: unknown; category?: unknown; gravity?: unknown; court?: unknown;
  latitude?: unknown; longitude?: unknown; briefFacts?: unknown;
  complainant?: unknown; accused?: unknown; victims?: unknown; sections?: unknown;
};

export type FirExtraction = {
  form: Partial<ExtractedForm>;
  extracted: string[];
  missing: string[];
  warnings: string[];
};

/** Every field the UI can mark as filled-from-document or not-found. */
export const EXTRACT_FIELDS = [
  "districtId", "policeStationId", "crimeMajorHeadId", "crimeMinorHeadId",
  "crimeRegisteredDate", "incidentFromDate", "caseCategoryId", "gravityOffenceId", "courtId",
  "latitude", "longitude", "briefFacts", "complainant", "accused", "victims", "sections",
] as const;

/* ── Pure helpers ────────────────────────────────────────────────── */

/** Case- and punctuation-insensitive form used for every "is this really in the document" check. */
export function normalise(s: unknown): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * True when the quote really occurs in the source text. This is the guard that
 * turns a hallucinated station or name into a blank field instead of a wrong FIR.
 */
export function appearsInDocument(quote: unknown, docText: string): boolean {
  const q = normalise(quote);
  return q.length > 0 && normalise(docText).includes(q);
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/** Minimum trigram lead the best candidate needs over the next one. */
const MATCH_MARGIN = 0.1;

/**
 * Free text → a canonical lookup name, or null when nothing is close enough.
 * `column` opts into entity-resolve's alias table (Bangalore → Bengaluru Urban)
 * for the four vocabularies it knows; everything else gets the same trigram
 * threshold via similarNames. No new fuzzy matching lives here.
 */
export function resolveVocab(value: unknown, names: string[], column?: keyof Vocab): string | null {
  const v = clean(value);
  if (!v || names.length === 0) return null;
  const exact = names.find((n) => n.toLowerCase() === v.toLowerCase());
  if (exact) return exact;
  const hit = column
    ? resolveLiterals(`"${column}" = '${v.replace(/'/g, "''")}'`, { [column]: names }).substitutions[0]?.to ?? null
    : similarNames(v, names, 1)[0] ?? null;
  if (!hit) return null;
  // Lookup names share a lot of boilerplate ("... PS 1", "... District Court"), so a
  // near-tie between two rows is a coin flip. Refuse both rather than pick one.
  const runnerUp = similarNames(v, names.filter((n) => n !== hit), 1)[0];
  if (runnerUp && similarity(v, hit) - similarity(v, runnerUp) < MATCH_MARGIN) return null;
  return hit;
}

const normAct = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

// Long forms officers write out in the body of an FIR.
const ACT_ALIASES: Record<string, string> = {
  INDIANPENALCODE: "IPC", PENALCODE: "IPC",
  BHARATIYANYAYASANHITA: "BNS", NYAYASANHITA: "BNS",
  INFORMATIONTECHNOLOGYACT: "IT_ACT", ITACT: "IT_ACT",
  NARCOTICDRUGSANDPSYCHOTROPICSUBSTANCESACT: "NDPS", NDPSACT: "NDPS",
  MOTORVEHICLESACT: "MV_ACT", MVACT: "MV_ACT",
  CODEOFCRIMINALPROCEDURE: "CRPC", CRPCACT: "CRPC",
};

/**
 * "IPC 379", "u/s 379 of the Indian Penal Code", "IT Act 66C" → "IPC|379".
 * Only pairs that exist in the Section table come back; a section number that
 * belongs to two acts with no act named in the text is ambiguous, so it is dropped.
 */
export function parseSectionRef(raw: unknown, sections: { ActCode: string; SectionCode: string }[]): string | null {
  const text = clean(raw);
  if (!text) return null;

  const packed = normAct(text);
  const codes = [...new Set(sections.map((s) => s.ActCode))];
  const byNorm = new Map<string, string>();
  for (const c of codes) byNorm.set(normAct(c), c);
  for (const [alias, code] of Object.entries(ACT_ALIASES)) {
    const real = byNorm.get(normAct(code));
    if (real) byNorm.set(alias, real);
  }
  // Longest key first so "ITACT" wins over a shorter key that is a substring of it.
  const actKey = [...byNorm.keys()].sort((a, b) => b.length - a.length).find((k) => packed.includes(k));
  const act = actKey ? byNorm.get(actKey)! : null;

  // The section number, ignoring any "1860"-style year that follows the act name.
  // The letter suffix must be attached to the digits — "379 of the ..." is section 379.
  const m = text.replace(/,?\s*(18|19|20)\d{2}\b/g, " ").match(/\b(\d{1,4})([A-Za-z]{0,2})\b/);
  if (!m) return null;
  const code = normAct(`${m[1]}${m[2]}`);

  const hits = sections.filter((s) => normAct(s.SectionCode) === code && (!act || s.ActCode === act));
  if (hits.length !== 1) return null;
  return `${hits[0].ActCode}|${hits[0].SectionCode}`;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Document dates → "YYYY-MM-DD". Day-first for numeric forms; two-digit years are refused as ambiguous. */
export function parseDocDate(raw: unknown): string | null {
  const text = clean(raw);
  if (!text) return null;
  const iso = (y: number, mo: number, d: number) => {
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return dt.toISOString().slice(0, 10);
  };

  let m = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  m = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (m) return iso(+m[3], +m[2], +m[1]);

  m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s.-]+([A-Za-z]{3,9})[\s.,-]+(\d{4})\b/);
  if (m) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mo >= 0) return iso(+m[3], mo + 1, +m[1]);
  }

  m = text.match(/\b([A-Za-z]{3,9})[\s.-]+(\d{1,2})(?:st|nd|rd|th)?[\s.,-]+(\d{4})\b/);
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mo >= 0) return iso(+m[3], mo + 1, +m[2]);
  }
  return null;
}

/** "Female", "F", "smt" → the form's genderId, or "" when the document does not say. */
export function parseGender(raw: unknown): string {
  const v = normalise(raw);
  if (!v) return "";
  if (/^(m|male|man|boy|shri|sri)\b/.test(v)) return "1";
  if (/^(f|female|woman|girl|smt|kum)\b/.test(v)) return "2";
  if (/(transgender|third gender|other)/.test(v)) return "3";
  return "";
}

/** "41 years" → "41". Out-of-range or missing ages come back blank. */
export function parseAge(raw: unknown): string {
  const m = clean(raw).match(/\d{1,3}/);
  if (!m) return "";
  const n = Number(m[0]);
  return n >= 0 && n <= 120 ? String(n) : "";
}

function parseCoord(raw: unknown, limit: number): string {
  const m = clean(raw).match(/-?\d{1,3}(?:\.\d+)?/);
  if (!m) return "";
  const n = Number(m[0]);
  return Number.isFinite(n) && Math.abs(n) <= limit ? String(n) : "";
}

function rawPeople(v: unknown): RawPerson[] {
  return Array.isArray(v) ? v.filter((p): p is RawPerson => typeof p === "object" && p !== null).slice(0, MAX_ROWS) : [];
}

function toPersonDraft(p: RawPerson, docText: string): PersonDraft | null {
  const name = clean(p.name);
  // A name the document does not contain is an invented person — drop the whole row.
  if (!appearsInDocument(name, docText)) return null;
  return { name, ageYear: parseAge(p.age), genderId: parseGender(p.gender) };
}

/* ── Assembly ────────────────────────────────────────────────────── */

/**
 * The whole model-output → form-draft step, with no network and no database:
 * everything that decides whether a field is filled lives here so it can be tested.
 */
export function buildDraft(raw: RawExtraction, lookups: ExtractLookups, docText: string): FirExtraction {
  const form: Partial<ExtractedForm> = {};
  const warnings: string[] = [];

  // A quoted value only survives if it is really in the document.
  const quoted = (v: unknown, label: string): string | null => {
    const s = clean(v);
    if (!s) return null;
    if (!appearsInDocument(s, docText)) { warnings.push(`"${s}" was reported as ${label} but is not in the document — left blank`); return null; }
    return s;
  };
  const unresolved = (s: string, label: string) => { warnings.push(`${label} "${s}" does not match any known ${label} — left blank`); };

  /* Jurisdiction. The station decides where the FIR lands, so it is only accepted
     when exactly one unit carries the resolved name. */
  const districtName = quoted(raw.district, "district");
  const districtHit = districtName ? resolveVocab(districtName, lookups.districts.map((d) => d.DistrictName), "DistrictName") : null;
  if (districtName && !districtHit) unresolved(districtName, "district");
  let district = lookups.districts.find((d) => d.DistrictName === districtHit) ?? null;

  const stationName = quoted(raw.policeStation, "police station");
  if (stationName) {
    const pool = district ? district.units.map((u) => ({ ...u, DistrictID: district!.DistrictID })) : lookups.districts.flatMap((d) => d.units.map((u) => ({ ...u, DistrictID: d.DistrictID })));
    const hit = resolveVocab(stationName, pool.map((u) => u.UnitName), "UnitName");
    const matches = hit ? pool.filter((u) => u.UnitName === hit) : [];
    if (matches.length === 1) {
      form.policeStationId = String(matches[0].UnitID);
      if (!district) district = lookups.districts.find((d) => d.DistrictID === matches[0].DistrictID) ?? null;
    } else if (matches.length > 1) {
      warnings.push(`police station "${stationName}" exists in more than one district — left blank`);
    } else {
      unresolved(stationName, "police station");
    }
  }
  if (district) form.districtId = String(district.DistrictID);

  /* Offence classification. */
  const groupName = quoted(raw.crimeGroup, "crime group");
  const groupHit = groupName ? resolveVocab(groupName, lookups.crimeHeads.map((h) => h.CrimeGroupName), "CrimeGroupName") : null;
  if (groupName && !groupHit) unresolved(groupName, "crime group");
  let head = lookups.crimeHeads.find((h) => h.CrimeGroupName === groupHit) ?? null;

  const crimeName = quoted(raw.crime, "crime");
  if (crimeName) {
    const pool = head ? head.subHeads.map((s) => ({ ...s, CrimeHeadID: head!.CrimeHeadID })) : lookups.crimeHeads.flatMap((h) => h.subHeads.map((s) => ({ ...s, CrimeHeadID: h.CrimeHeadID })));
    const hit = resolveVocab(crimeName, pool.map((s) => s.CrimeHeadName), "CrimeHeadName");
    const matches = hit ? pool.filter((s) => s.CrimeHeadName === hit) : [];
    if (matches.length === 1) {
      form.crimeMinorHeadId = String(matches[0].CrimeSubHeadID);
      if (!head) head = lookups.crimeHeads.find((h) => h.CrimeHeadID === matches[0].CrimeHeadID) ?? null;
    } else if (matches.length > 1) {
      warnings.push(`crime "${crimeName}" belongs to more than one crime group — left blank`);
    } else {
      unresolved(crimeName, "crime");
    }
  }
  if (head) form.crimeMajorHeadId = String(head.CrimeHeadID);

  /* Dates. An unparseable date stays blank rather than becoming today. */
  const registered = parseDocDate(quoted(raw.registeredDate, "registration date"));
  if (registered) form.crimeRegisteredDate = registered;
  const incident = parseDocDate(quoted(raw.incidentDate, "incident date"));
  if (incident) form.incidentFromDate = incident;

  /* Optional classifications. */
  const categoryName = quoted(raw.category, "category");
  const categoryHit = categoryName ? resolveVocab(categoryName, lookups.categories.map((c) => c.LookupValue)) : null;
  if (categoryName && !categoryHit) unresolved(categoryName, "category");
  const category = lookups.categories.find((c) => c.LookupValue === categoryHit);
  if (category) form.caseCategoryId = String(category.CaseCategoryID);

  const gravityName = quoted(raw.gravity, "gravity");
  const gravityHit = gravityName ? resolveVocab(gravityName, lookups.gravity.map((g) => g.LookupValue)) : null;
  if (gravityName && !gravityHit) unresolved(gravityName, "gravity");
  const gravity = lookups.gravity.find((g) => g.LookupValue === gravityHit);
  if (gravity) form.gravityOffenceId = String(gravity.GravityOffenceID);

  // Resolved across every court, then checked against the district — narrowing the
  // candidate list first would let "Mysuru District Court" land on the one court in
  // Bengaluru purely on the shared words.
  const courtName = quoted(raw.court, "court");
  if (courtName) {
    const hit = resolveVocab(courtName, lookups.courts.map((c) => c.CourtName));
    const matches = hit ? lookups.courts.filter((c) => c.CourtName === hit) : [];
    const inDistrict = matches.filter((c) => !district || c.DistrictID === null || c.DistrictID === district.DistrictID);
    if (inDistrict.length === 1) form.courtId = String(inDistrict[0].CourtID);
    else if (matches.length === 0) unresolved(courtName, "court");
    else warnings.push(`court "${courtName}" is not a court of the district on this FIR — left blank`);
  }

  const lat = parseCoord(quoted(raw.latitude, "latitude"), 90);
  if (lat) form.latitude = lat;
  const lon = parseCoord(quoted(raw.longitude, "longitude"), 180);
  if (lon) form.longitude = lon;

  /* Brief facts is the one field allowed to be a condensation rather than a quote:
     it lands in a textarea the officer reads in full, and a wrong word there cannot
     misfile the case the way a wrong id can. It is still flagged when reworded. */
  const facts = clean(raw.briefFacts);
  if (facts.length >= 20) {
    form.briefFacts = facts.slice(0, 4000);
    if (!appearsInDocument(facts, docText)) warnings.push("brief facts were condensed from the document — read them before registering");
  }

  /* People. */
  const complainant = typeof raw.complainant === "object" && raw.complainant !== null ? toPersonDraft(raw.complainant as RawPerson, docText) : null;
  if (complainant) form.complainant = complainant;
  const accused = rawPeople(raw.accused).map((p) => toPersonDraft(p, docText)).filter((p): p is PersonDraft => p !== null);
  if (accused.length) form.accused = accused;
  const victims = rawPeople(raw.victims).map((p) => toPersonDraft(p, docText)).filter((p): p is PersonDraft => p !== null);
  if (victims.length) form.victims = victims;

  /* Sections: only real Act/Section pairs, deduplicated, capped like the form is. */
  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
  const keys: string[] = [];
  for (const s of rawSections) {
    const key = parseSectionRef(s, lookups.sections);
    if (!key) { const label = clean(s); if (label) warnings.push(`section "${label}" is not in the Act/Section list — left out`); continue; }
    if (!keys.includes(key)) keys.push(key);
  }
  if (keys.length) form.sections = keys.slice(0, MAX_ROWS);

  const extracted = EXTRACT_FIELDS.filter((f) => form[f] !== undefined);
  const missing = EXTRACT_FIELDS.filter((f) => form[f] === undefined);
  return { form, extracted: [...extracted], missing: [...missing], warnings };
}

/* ── The model call ──────────────────────────────────────────────── */

const SYSTEM_PROMPT = `You read Indian police FIR documents and pull out the fields of a registration form.
Rules:
- Reply with ONE JSON object and nothing else. No markdown, no commentary.
- Every value must be copied VERBATIM from the document. Never translate, never rephrase, never abbreviate, never expand.
- If the document does not state a field, its value MUST be null (or an empty array). Never infer it, never guess it from context, never use a plausible default. A blank field is correct; a wrong one is dangerous.
- Never output an id, a code, or a number you invented.
Keys (all optional, all null when absent):
  "district": the revenue district named in the document
  "policeStation": the police station the FIR is registered at
  "crimeGroup": the crime group/category of offence as written
  "crime": the specific offence as written
  "registeredDate": the FIR registration date, exactly as printed
  "incidentDate": the date of occurrence, exactly as printed
  "category", "gravity": case category / gravity of offence, if the document labels them
  "court": the court named, if any
  "latitude", "longitude": only if printed as numbers
  "briefFacts": the narrative of what happened, copied from the document (condense only if it exceeds 4000 characters)
  "complainant": {"name","age","gender"} of the complainant/informant, each null if absent
  "accused": array of {"name","age","gender"} — empty array if the document names none
  "victims": array of {"name","age","gender"} — empty array if the document names none
  "sections": array of strings exactly as the document writes them, e.g. ["IPC 379", "u/s 420 IPC"]`;

/** Reads an FIR document and returns a form draft plus what was and was not found. */
export async function extractFirFromDocument(docText: string, lookups: ExtractLookups): Promise<FirExtraction> {
  const text = docText.slice(0, MAX_DOC_CHARS);
  const llm = getLlmClient();
  const completion = await llm.chat.completions.create({
    model: EXTRACT_MODEL,
    temperature: 0,
    max_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `FIR document:\n"""\n${text}\n"""` },
    ],
  });

  let raw: RawExtraction;
  try {
    raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as RawExtraction;
  } catch {
    // Malformed JSON means we know nothing — an empty draft, not a partial guess.
    return { form: {}, extracted: [], missing: [...EXTRACT_FIELDS], warnings: ["The document could not be read into fields. Fill the form manually."] };
  }
  return buildDraft(raw, lookups, text);
}
