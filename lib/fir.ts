// Pure FIR-registration helpers: request validation + CrimeNo/CaseNo builder.
// No DB access here so it is unit-testable; existence checks live in lib/fir-create.ts.

export type Person = { name: string; ageYear?: number | null; genderId?: number | null };
export type AccusedIn = Person & { personId?: string | null };

export type FirInput = {
  policeStationId: number;
  crimeMajorHeadId: number;
  crimeMinorHeadId: number;
  crimeRegisteredDate: Date;
  incidentFromDate: Date | null;
  caseCategoryId: number | null;
  gravityOffenceId: number | null;
  courtId: number | null;
  latitude: number | null;
  longitude: number | null;
  briefFacts: string;
  complainant: Person;
  accused: AccusedIn[];
  victims: Person[];
  sections: { actCode: string; sectionCode: string }[];
};

export type ValidationResult = { ok: true; value: FirInput } | { ok: false; errors: string[] };

export const MAX_ROWS = 10;
const MIN_FACTS = 20;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const posInt = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v > 0;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function optId(v: unknown, name: string, errors: string[]): number | null {
  if (v === undefined || v === null || v === "") return null;
  if (!posInt(v)) errors.push(`${name} must be a positive integer`);
  return v as number;
}

function optNum(v: unknown, name: string, min: number, max: number, errors: string[]): number | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) errors.push(`${name} must be between ${min} and ${max}`);
  return v as number;
}

// Accepts "YYYY-MM-DD" (or a full ISO string); returns a Date or null.
function parseDate(v: unknown, name: string, now: Date, errors: string[], required: boolean): Date | null {
  if (v === undefined || v === null || v === "") {
    if (required) errors.push(`${name} is required`);
    return null;
  }
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) { errors.push(`${name} is not a valid date`); return null; }
  if (d.getTime() > now.getTime()) errors.push(`${name} cannot be in the future`);
  return d;
}

function person(v: unknown, label: string, errors: string[], allowPersonId = false): AccusedIn {
  if (!isObj(v)) { errors.push(`${label} must be an object`); return { name: "" }; }
  const name = str(v.name);
  if (!name) errors.push(`${label} name is required`);
  if (name.length > 120) errors.push(`${label} name is too long`);
  const out: AccusedIn = {
    name,
    ageYear: optNum(v.ageYear, `${label} ageYear`, 0, 120, errors),
    genderId: optNum(v.genderId, `${label} genderId`, 1, 3, errors),
  };
  if (allowPersonId) out.personId = str(v.personId) || null;
  return out;
}

function people(v: unknown, label: string, errors: string[], allowPersonId: boolean): AccusedIn[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) { errors.push(`${label} must be an array`); return []; }
  if (v.length > MAX_ROWS) { errors.push(`${label} is limited to ${MAX_ROWS} rows`); return []; }
  return v.map((p, i) => person(p, `${label}[${i}]`, errors, allowPersonId));
}

export function validateFirInput(body: unknown, now: Date = new Date()): ValidationResult {
  if (!isObj(body)) return { ok: false, errors: ["body must be a JSON object"] };
  const errors: string[] = [];
  const b = body;

  for (const k of ["policeStationId", "crimeMajorHeadId", "crimeMinorHeadId"]) {
    if (!posInt(b[k])) errors.push(`${k} must be a positive integer`);
  }
  const crimeRegisteredDate = parseDate(b.crimeRegisteredDate, "crimeRegisteredDate", now, errors, true);
  const incidentFromDate = parseDate(b.incidentFromDate, "incidentFromDate", now, errors, false);
  if (crimeRegisteredDate && incidentFromDate && incidentFromDate.getTime() > crimeRegisteredDate.getTime() + 86_400_000) {
    errors.push("incidentFromDate cannot be after crimeRegisteredDate");
  }

  const briefFacts = str(b.briefFacts);
  if (briefFacts.length < MIN_FACTS) errors.push(`briefFacts must be at least ${MIN_FACTS} characters`);
  if (briefFacts.length > 4000) errors.push("briefFacts must be at most 4000 characters");

  const complainant = person(b.complainant, "complainant", errors);
  const accused = people(b.accused, "accused", errors, true);
  const victims = people(b.victims, "victims", errors, false);

  let sections: FirInput["sections"] = [];
  if (b.sections !== undefined) {
    if (!Array.isArray(b.sections)) errors.push("sections must be an array");
    else if (b.sections.length > MAX_ROWS) errors.push(`sections is limited to ${MAX_ROWS} rows`);
    else {
      sections = b.sections.map((s: unknown) => ({
        actCode: isObj(s) ? str(s.actCode) : "",
        sectionCode: isObj(s) ? str(s.sectionCode) : "",
      }));
      if (sections.some((s) => !s.actCode || !s.sectionCode)) errors.push("each section needs actCode and sectionCode");
    }
  }

  const value: FirInput = {
    policeStationId: b.policeStationId as number,
    crimeMajorHeadId: b.crimeMajorHeadId as number,
    crimeMinorHeadId: b.crimeMinorHeadId as number,
    crimeRegisteredDate: crimeRegisteredDate ?? now,
    incidentFromDate,
    caseCategoryId: optId(b.caseCategoryId, "caseCategoryId", errors),
    gravityOffenceId: optId(b.gravityOffenceId, "gravityOffenceId", errors),
    courtId: optId(b.courtId, "courtId", errors),
    latitude: optNum(b.latitude, "latitude", -90, 90, errors),
    longitude: optNum(b.longitude, "longitude", -180, 180, errors),
    briefFacts,
    complainant,
    accused,
    victims,
    sections,
  };
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

/** Same shape prisma/seed.ts emits: "1" + DistrictID(4) + UnitID(4) + YYYY + serial(5). */
export function buildCaseNumbers(p: { districtId: number; unitId: number; year: number; serial: number }) {
  const pad = (n: number, w: number) => String(n).padStart(w, "0");
  const caseNo = `${p.year}${pad(p.serial, 5)}`;
  return { crimeNo: `1${pad(p.districtId, 4)}${pad(p.unitId, 4)}${caseNo}`, caseNo };
}
