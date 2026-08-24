import type { Db } from "./db";
import { similarity } from "./entity-resolve";

/**
 * Repeat victimisation — the people this data shows being victimised more than
 * once.
 *
 * This is one of the best-evidenced findings in policing: a small number of
 * victims absorb a large share of crime, and unlike offenders they are
 * predictable — the strongest single indicator that someone will be victimised
 * is that they already have been, and the risk runs highest in the weeks right
 * after. Every other screen in this app looks at cases, hotspots or accused.
 * The register can currently answer nothing at all about the people the crimes
 * happened to.
 *
 * So what comes out of here is a protection list, not a suspect list. Everyone
 * on it is someone who may need attention — a call, a beat visit, a security
 * check — and nothing on it is an allegation about anybody.
 *
 * THE LIMIT, stated up front because it shapes every number below: `Victim`
 * carries a name, an age in years and a gender. No address, no phone, no
 * identifier. So "the same person" can only ever be inferred from the name, an
 * age that moves the way the calendar says it should, and gender agreement.
 * Two different people who share a common name and happen to be a similar age
 * CANNOT always be separated by this data, and no amount of scoring changes
 * that. The clustering is therefore built to refuse rather than to assert:
 * hard blocks first, then weights, then caps that hold a coincidence-shaped
 * match below the bar. Every cluster carries a confidence and the reasons
 * behind it, and the UI states the limit in the officer's own language
 * (`victims.caveat`).
 *
 * Scope-aware in the same way as the desk and the crew walk — it takes the
 * caller's `Db`, so a district-posted officer's list is built only from the
 * victim rows RLS lets them read.
 */

// ---- signals ----------------------------------------------------------------

export type VictimPlace = "sameStation" | "sameDistrict" | "otherDistrict";

/** The already-fetched facts about one pair of victim rows. Scoring never touches the database. */
export interface VictimPairSignals {
  nameA: string;
  nameB: string;
  ageA: number | null;
  ageB: number | null;
  genderA: number | null;
  genderB: number | null;
  /** Years between the two cases; null when either file carries no date. */
  yearGap: number | null;
  /**
   * How many victim rows in the corpus are written with this name. A name borne
   * by thirty people identifies nobody; a name borne by one is nearly an id.
   */
  nameBearers: number;
  place: VictimPlace;
}

export type VictimSignalName = "name" | "age" | "gender" | "rarity" | "place";

export interface VictimReason {
  signal: VictimSignalName;
  /** How much this signal contributed to the confidence, 0..1. */
  weight: number;
  label: string;
}

/** Why a pair was refused outright, or held down. */
export type VictimBlock = "gender" | "age" | "name" | null;
export type VictimCap = "mononym" | "common-name" | null;

export interface VictimMatchScore {
  confidence: number;
  isMatch: boolean;
  reasons: VictimReason[];
  blocked: VictimBlock;
  capped: VictimCap;
}

// ---- thresholds -------------------------------------------------------------

export const VIC = {
  /**
   * Two registers spelling one person's name differ by a vowel or a dropped
   * initial, not by a whole word. Below this the pair is two names, and no
   * agreement elsewhere is allowed to argue otherwise.
   */
  nameGate: 0.82,
  /** Scaling floor: 0.80 scores 0, an exact normalised match scores 1. */
  nameFloor: 0.8,
  /**
   * The age tolerance, in years, before the calendar itself rules the match
   * out. Ages in the register are rounded, guessed and sometimes copied off an
   * older file, so a couple of years of drift is normal; the slack widens with
   * the gap, because a stale age gets repeated more often over a long interval.
   */
  ageToleranceBase: 2,
  ageTolerancePerYear: 0.25,
  /** No age on one side: neither credit nor a block — the pair is simply less evidenced. */
  ageUnknownScore: 0.35,
  /** Gender missing on one side. Agreement is cheap here (the register holds two values), so this is small either way. */
  genderUnknownScore: 0.4,
  /** At this many bearers of a name, the name has stopped identifying anybody. */
  rarityCeiling: 12,
  /** Below this rarity the name is common enough that the cap applies. */
  rarityCommon: 0.2,
  /** At or above this a pair is treated as the same person. */
  threshold: 0.6,
  /**
   * A single given name ("Ravi") is not an identity, however well the age and
   * gender line up — in a register of twenty thousand victims there are
   * hundreds of them. Held below the bar so it can never cluster on its own.
   */
  mononymCap: 0.5,
  /**
   * A common full name still clusters — refusing outright would erase real
   * repeat victims — but it can never read as a confident identification. This
   * is the honest ceiling on what name + age + gender is able to prove.
   */
  commonNameCap: 0.72,
  /** A signal is listed as a reason once it clears this sub-score. */
  reasonFires: 0.25,
} as const;

/**
 * Weights, and why.
 *
 *  name   .34 — necessary but nowhere near sufficient, so under half. It is
 *               also the hard gate below; the weight only grades how well two
 *               spellings agree once they are already close enough to consider.
 *  age    .30 — nearly as heavy, because it is the one signal that separates
 *               two people sharing a name: an age that has moved exactly as
 *               much as the calendar did is real evidence, and an age that has
 *               not is a block.
 *  rarity .16 — the name's information content. Without it every "Suresh
 *               Gowda" in the district collapses into one person.
 *  gender .10 — agreement is nearly free in a two-valued field, so it earns
 *               little; disagreement, on the other hand, is a block.
 *  place  .10 — the victim record has no address, so the station and district
 *               of the FIR are the only geographic proxy there is. Repeat
 *               victimisation is overwhelmingly local, so this corroborates —
 *               but a person who moves is exactly who we must not lose, so it
 *               can never be a large share.
 */
const WEIGHTS: Record<VictimSignalName, number> = {
  name: 0.34,
  age: 0.3,
  rarity: 0.16,
  gender: 0.1,
  place: 0.1,
};

const PLACE_SCORE: Record<VictimPlace, number> = {
  sameStation: 1,
  sameDistrict: 0.6,
  otherDistrict: 0.15,
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// Honorifics and the "s/o" / "w/o" tails are noise in the register; two clerks
// writing the same victim rarely agree on them.
const NAME_NOISE = /\b(sri|shri|smt|smti|kum|kumari|mr|mrs|ms|md|dr)\b\.?/gi;

export function normaliseVictimName(n: string): string {
  return n
    .toLowerCase()
    .replace(NAME_NOISE, " ")
    .replace(/\b[swd]\s*\/\s*o\b.*$/i, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 1 for a name nobody else bears, falling to 0 once it is worn by `rarityCeiling` people. */
export function nameRarity(bearers: number): number {
  return clamp01(1 - Math.max(0, bearers - 1) / VIC.rarityCeiling);
}

/** How far the two ages are from where the calendar says they should be. */
export function ageDrift(ageA: number, ageB: number, yearGap: number): number {
  return Math.abs(ageB - ageA - yearGap);
}

function ageTolerance(yearGap: number): number {
  return VIC.ageToleranceBase + VIC.ageTolerancePerYear * Math.abs(yearGap);
}

/**
 * Pure scoring — takes facts already fetched and returns the confidence that
 * the two rows describe one person, plus the reasons behind it. No database,
 * no network, so the whole judgement is testable on its own.
 */
export function scoreVictimPair(s: VictimPairSignals): VictimMatchScore {
  const na = normaliseVictimName(s.nameA);
  const nb = normaliseVictimName(s.nameB);
  const nameSim = na && nb ? (na === nb ? 1 : similarity(na, nb)) : 0;

  const refuse = (blocked: VictimBlock): VictimMatchScore => ({
    confidence: 0,
    isMatch: false,
    reasons: [],
    blocked,
    capped: null,
  });

  // Blocks come before weights, so no amount of agreement elsewhere can talk
  // the scorer past a fact that rules the match out.
  if (nameSim < VIC.nameGate) return refuse("name");
  if (s.genderA != null && s.genderB != null && s.genderA !== s.genderB) return refuse("gender");

  const gap = s.yearGap;
  const drift =
    s.ageA != null && s.ageB != null && gap != null ? ageDrift(s.ageA, s.ageB, gap) : null;
  if (drift != null && gap != null && drift > ageTolerance(gap)) return refuse("age");

  const rarity = nameRarity(s.nameBearers);
  const tokens = Math.min(na.split(" ").length, nb.split(" ").length);

  const sub: Record<VictimSignalName, number> = {
    name: clamp01((nameSim - VIC.nameFloor) / (1 - VIC.nameFloor)),
    age: drift == null || gap == null ? VIC.ageUnknownScore : clamp01(1 - drift / ageTolerance(gap)),
    rarity,
    gender: s.genderA != null && s.genderB != null ? 1 : VIC.genderUnknownScore,
    place: PLACE_SCORE[s.place],
  };

  const names = Object.keys(WEIGHTS) as VictimSignalName[];
  let confidence = names.reduce((acc, k) => acc + sub[k] * WEIGHTS[k], 0);

  // Conservatism. Both caps are about refusing to over-claim, not about hiding.
  let capped: VictimCap = null;
  if (rarity < VIC.rarityCommon && confidence > VIC.commonNameCap) {
    confidence = VIC.commonNameCap;
    capped = "common-name";
  }
  if (tokens < 2 && confidence > VIC.mononymCap) {
    confidence = VIC.mononymCap;
    capped = "mononym";
  }

  const reasons: VictimReason[] = names
    .filter((k) => sub[k] >= VIC.reasonFires)
    .map((k) => ({
      signal: k,
      weight: Number((sub[k] * WEIGHTS[k]).toFixed(3)),
      label: labelFor(k, s, { nameSim, drift, rarity }),
    }))
    .sort((a, b) => b.weight - a.weight);

  return {
    confidence: Number(confidence.toFixed(3)),
    isMatch: confidence >= VIC.threshold,
    reasons,
    blocked: null,
    capped,
  };
}

function labelFor(
  k: VictimSignalName,
  s: VictimPairSignals,
  x: { nameSim: number; drift: number | null; rarity: number }
): string {
  switch (k) {
    case "name":
      return x.nameSim === 1 ? "Name recorded identically" : `Names ${Math.round(x.nameSim * 100)}% alike`;
    case "age": {
      if (x.drift == null) return "Age not recorded on both files";
      const gap = Math.abs(s.yearGap ?? 0);
      return x.drift < 0.5
        ? `Age moves with the ${gap < 1 ? "months" : `${gap.toFixed(1)} years`} between the cases`
        : `Age consistent to within ${x.drift.toFixed(1)} years`;
    }
    case "gender":
      return "Gender agrees";
    case "rarity":
      return s.nameBearers <= 2 ? "Name is all but unique in this register" : `Name borne by only ${s.nameBearers} victims`;
    case "place":
      return s.place === "sameStation" ? "Both reported at the same station" : "Both reported in the same district";
  }
}

// ---- clustering -------------------------------------------------------------

/** One victim row, already joined to its case. */
export interface VictimRecord {
  victimId: number;
  caseId: number;
  crimeNo: string | null;
  name: string;
  age: number | null;
  genderId: number | null;
  date: string | null;
  districtId: number | null;
  district: string | null;
  stationId: number | null;
  station: string | null;
  crimeType: string | null;
  status: string | null;
}

export interface VictimCase {
  caseId: number;
  crimeNo: string | null;
  date: string | null;
  district: string | null;
  station: string | null;
  crimeType: string | null;
  status: string | null;
  ageRecorded: number | null;
}

export interface VictimCluster {
  /** Stable within one response only — there is no person id in this schema to key on. */
  id: string;
  /** The person exactly as the register wrote them, not a canonicalised identity. */
  person: { name: string; age: number | null; gender: string | null };
  cases: VictimCase[];
  caseCount: number;
  first: string | null;
  last: string | null;
  spanDays: number | null;
  districts: string[];
  stations: string[];
  crimeTypes: string[];
  /** The weakest link inside the cluster — see clusterOf(). */
  confidence: number;
  reasons: VictimReason[];
  capped: VictimCap;
}

const DAY = 86_400_000;

function placeOf(a: VictimRecord, b: VictimRecord): VictimPlace {
  if (a.stationId != null && a.stationId === b.stationId) return "sameStation";
  if (a.districtId != null && a.districtId === b.districtId) return "sameDistrict";
  return "otherDistrict";
}

function yearGapOf(a: VictimRecord, b: VictimRecord): number | null {
  if (!a.date || !b.date) return null;
  return (Date.parse(b.date) - Date.parse(a.date)) / (365.25 * DAY);
}

/**
 * Blocking key. Comparing every victim against every other is quadratic in a
 * register of twenty thousand rows; two spellings of one name almost always
 * agree on the first three letters of each part, so this narrows the search to
 * a few dozen candidates without giving up the fuzzy matching itself.
 */
export function blockKey(name: string): string {
  return normaliseVictimName(name)
    .split(" ")
    .filter(Boolean)
    .map((t) => t.slice(0, 3))
    .sort()
    .join("|");
}

interface RawCluster {
  members: VictimRecord[];
  confidence: number;
  reasons: VictimReason[];
  capped: VictimCap;
}

/**
 * Complete linkage, deliberately. Single-linkage clustering would chain A to C
 * through B even when A and C are plainly different people — exactly the
 * failure mode that turns a protection list into a smear. Here a row joins a
 * cluster only if it matches EVERY row already in it, and the cluster's
 * confidence is the weakest of those pairwise scores.
 */
function clusterOf(rows: VictimRecord[], bearers: Map<string, number>): RawCluster[] {
  const groups: { members: VictimRecord[]; scores: VictimMatchScore[] }[] = [];

  // Oldest first, so a cluster grows forward in time and its anchor is the
  // first time this person appears in the register.
  const ordered = [...rows].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  for (const row of ordered) {
    let placed = false;
    for (const g of groups) {
      const scores = g.members.map((m) =>
        scoreVictimPair({
          nameA: m.name,
          nameB: row.name,
          ageA: m.age,
          ageB: row.age,
          genderA: m.genderId,
          genderB: row.genderId,
          yearGap: yearGapOf(m, row),
          nameBearers: bearers.get(normaliseVictimName(row.name)) ?? 1,
          place: placeOf(m, row),
        })
      );
      if (!scores.every((s) => s.isMatch)) continue;
      g.members.push(row);
      g.scores.push(...scores);
      placed = true;
      break;
    }
    if (!placed) groups.push({ members: [row], scores: [] });
  }

  return groups.map((g) => {
    const confidence = g.scores.length ? Math.min(...g.scores.map((s) => s.confidence)) : 0;
    // One reason per signal, at its strongest across the cluster's links.
    const best = new Map<VictimSignalName, VictimReason>();
    for (const s of g.scores)
      for (const r of s.reasons)
        if (!best.has(r.signal) || best.get(r.signal)!.weight < r.weight) best.set(r.signal, r);
    return {
      members: g.members,
      confidence,
      reasons: [...best.values()].sort((a, b) => b.weight - a.weight),
      capped: g.scores.find((s) => s.capped)?.capped ?? null,
    };
  });
}

// ---- the headline distribution ---------------------------------------------

export interface VictimDistribution {
  /** Victim rows considered (one per named victim per case). */
  victimRecords: number;
  /** Distinct cases those rows belong to. */
  cases: number;
  /** People after clustering — the denominator of the finding. */
  people: number;
  /** People appearing in two or more cases. */
  repeatPeople: number;
  /** Their share of all people, 0..1. */
  repeatShare: number;
  /** Cases in which at least one repeat victim is named. */
  repeatCases: number;
  /** Their share of all cases with a named victim, 0..1. This ratio is the finding. */
  repeatCaseShare: number;
  /** Most cases attached to any one person. */
  maxCases: number;
}

export interface RepeatVictimReport {
  clusters: VictimCluster[];
  distribution: VictimDistribution;
  generatedAt: string;
  /** True when the corpus cap stopped the scan short — the real figures are larger. */
  truncated: boolean;
}

export interface RepeatVictimOptions {
  /** Only report people with at least this many cases. */
  minCases?: number;
  /** Cap on clusters returned; the distribution is still computed over everything scanned. */
  limit?: number;
  /** Victim rows to pull. A guard against a runaway scan, not a correctness knob. */
  maxRecords?: number;
}

const DEFAULTS = { minCases: 2, limit: 100, maxRecords: 40_000 };

function genderOf(id: number | null): string | null {
  return id === 1 ? "Male" : id === 2 ? "Female" : id ? "Transgender" : null;
}

const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))].sort();

type Row = {
  victim_id: number; case_id: number; crime_no: string | null; name: string;
  age: number | null; gender_id: number | null; date: string | null;
  district_id: number | null; district: string | null;
  station_id: number | null; station: string | null;
  crime_type: string | null; status: string | null;
};

/** Every named victim in scope, with the case they belong to. */
export async function loadVictimRecords(db: Db, maxRecords: number): Promise<VictimRecord[]> {
  const rows = await db.$queryRawUnsafe<Row[]>(
    `SELECT v."VictimMasterID" AS victim_id, v."CaseMasterID" AS case_id, cm."CrimeNo" AS crime_no,
            v."VictimName" AS name, v."AgeYear" AS age, v."GenderID" AS gender_id,
            to_char(COALESCE(cm."IncidentFromDate", cm."CrimeRegisteredDate"), 'YYYY-MM-DD') AS date,
            d."DistrictID" AS district_id, d."DistrictName" AS district,
            u."UnitID" AS station_id, u."UnitName" AS station,
            COALESCE(csh."CrimeHeadName", ch."CrimeGroupName") AS crime_type,
            cs."CaseStatusName" AS status
     FROM "Victim" v
     JOIN "CaseMaster" cm ON cm."CaseMasterID" = v."CaseMasterID"
     LEFT JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
     LEFT JOIN "District" d ON d."DistrictID" = u."DistrictID"
     LEFT JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
     LEFT JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
     LEFT JOIN "CaseStatusMaster" cs ON cs."CaseStatusID" = cm."CaseStatusID"
     WHERE v."VictimName" IS NOT NULL AND btrim(v."VictimName") <> ''
     ORDER BY v."VictimMasterID"
     LIMIT $1`,
    maxRecords
  );
  return rows.map((r) => ({
    victimId: Number(r.victim_id),
    caseId: Number(r.case_id),
    crimeNo: r.crime_no,
    name: r.name,
    age: r.age == null ? null : Number(r.age),
    genderId: r.gender_id == null ? null : Number(r.gender_id),
    date: r.date,
    districtId: r.district_id == null ? null : Number(r.district_id),
    district: r.district,
    stationId: r.station_id == null ? null : Number(r.station_id),
    station: r.station,
    crimeType: r.crime_type,
    status: r.status,
  }));
}

/** Clustering and the distribution, over records already in memory. Pure apart from the clock. */
export function buildRepeatVictims(
  records: VictimRecord[],
  opts: RepeatVictimOptions = {}
): Omit<RepeatVictimReport, "truncated"> {
  const cfg = { ...DEFAULTS, ...opts };

  // How many victim rows each written name covers, corpus-wide. Computed once
  // and handed to the scorer, because rarity is a property of the register and
  // not of the pair being judged.
  const bearers = new Map<string, number>();
  for (const r of records) {
    const key = normaliseVictimName(r.name);
    bearers.set(key, (bearers.get(key) ?? 0) + 1);
  }

  const blocks = new Map<string, VictimRecord[]>();
  for (const r of records) {
    const key = blockKey(r.name);
    if (!key) continue;
    (blocks.get(key) ?? blocks.set(key, []).get(key)!).push(r);
  }

  const clusters: VictimCluster[] = [];
  let people = 0;
  let repeatPeople = 0;
  let maxCases = 0;
  const repeatCaseIds = new Set<number>();

  for (const rows of blocks.values()) {
    for (const g of clusterOf(rows, bearers)) {
      people++;
      const caseIds = new Set(g.members.map((m) => m.caseId));
      maxCases = Math.max(maxCases, caseIds.size);
      // A person named twice on one FIR is one victimisation, not two.
      if (caseIds.size < 2) continue;
      repeatPeople++;
      for (const id of caseIds) repeatCaseIds.add(id);
      if (caseIds.size < cfg.minCases) continue;

      const byCase = new Map<number, VictimRecord>();
      for (const m of g.members) if (!byCase.has(m.caseId)) byCase.set(m.caseId, m);
      const cases: VictimCase[] = [...byCase.values()]
        .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
        .map((m) => ({
          caseId: m.caseId,
          crimeNo: m.crimeNo,
          date: m.date,
          district: m.district,
          station: m.station,
          crimeType: m.crimeType,
          status: m.status,
          ageRecorded: m.age,
        }));

      const dated = cases.map((c) => c.date).filter((d): d is string => Boolean(d));
      const first = dated[0] ?? null;
      const last = dated[dated.length - 1] ?? null;
      const latest = g.members.reduce((a, b) => ((a.date ?? "") >= (b.date ?? "") ? a : b));

      clusters.push({
        id: `v${g.members[0].victimId}`,
        person: { name: latest.name.trim(), age: latest.age, gender: genderOf(latest.genderId) },
        cases,
        caseCount: cases.length,
        first,
        last,
        spanDays: first && last ? Math.round((Date.parse(last) - Date.parse(first)) / DAY) : null,
        districts: uniq(cases.map((c) => c.district)),
        stations: uniq(cases.map((c) => c.station)),
        crimeTypes: uniq(cases.map((c) => c.crimeType)),
        confidence: Number(g.confidence.toFixed(3)),
        reasons: g.reasons,
        capped: g.capped,
      });
    }
  }

  // Most cases first, then the strongest identification — an officer should
  // reach the most-victimised person first, not the best-evidenced one.
  clusters.sort((a, b) => b.caseCount - a.caseCount || b.confidence - a.confidence);

  const cases = new Set(records.map((r) => r.caseId)).size;
  return {
    clusters: clusters.slice(0, cfg.limit),
    distribution: {
      victimRecords: records.length,
      cases,
      people,
      repeatPeople,
      repeatShare: people ? Number((repeatPeople / people).toFixed(4)) : 0,
      repeatCases: repeatCaseIds.size,
      repeatCaseShare: cases ? Number((repeatCaseIds.size / cases).toFixed(4)) : 0,
      maxCases,
    },
    generatedAt: new Date().toISOString(),
  };
}

/** The screen's whole payload: who is being victimised repeatedly, and how much of the crime that is. */
export async function findRepeatVictims(
  db: Db,
  opts: RepeatVictimOptions = {}
): Promise<RepeatVictimReport> {
  const cfg = { ...DEFAULTS, ...opts };
  const records = await loadVictimRecords(db, cfg.maxRecords);
  return { ...buildRepeatVictims(records, cfg), truncated: records.length >= cfg.maxRecords };
}
