import { scopedClient, type Db } from "./db";
import { similarity } from "./entity-resolve";

/**
 * Duplicate FIR detection — the mirror image of modus-operandi linking.
 *
 * MO linking asks "different crimes, same crew?". This asks the opposite:
 * "same crime, two files?" — one incident written up twice, either re-entered
 * at the same station or reported again at the next one over because the
 * complainant did not know the first FIR had been taken.
 *
 * The two questions need opposite instincts. An MO link is happy with a loose
 * narrative match, because two burglaries by the same crew genuinely read
 * differently. A duplicate is the same event described twice, so the narrative
 * has to read almost the same AND the people have to line up. A similarity
 * number on its own would flag every pair of chain-snatchings in a week; this
 * scores several independent signals and reports which ones fired, so the
 * officer is told WHY rather than handed a percentage to trust.
 *
 * Runs inside the caller's scope exactly like the crew walk — a district-posted
 * officer only ever sees pairs among the files RLS lets them read.
 */

// ---- signals ----------------------------------------------------------------

export type StationRelation = "same" | "sameDistrict" | "otherDistrict";

/** The already-fetched facts about one pair. Scoring never touches the database. */
export interface DuplicateSignals {
  /** Cosine similarity of the two narratives (pgvector), 0..1. */
  narrative: number;
  /** Days between the two incidents; null when neither file carries a date. */
  dayGap: number | null;
  station: StationRelation;
  /** Same crime sub-head (the minor head, e.g. "House Break-in by Night"). */
  sameSubHead: boolean;
  /** Best name similarity across the two files' complainants and victims, 0..1. */
  personMatch: number;
  /** The pair of names behind `personMatch`, for the "why" line. */
  personLabel?: string | null;
}

export type DuplicateSignalName = "narrative" | "people" | "date" | "station" | "crimeType";

export interface DuplicateReason {
  signal: DuplicateSignalName;
  /** How much this signal contributed to the likelihood, 0..1. */
  weight: number;
  label: string;
}

export type DuplicateCap = "no-person" | "weak-narrative" | null;

export interface DuplicateScore {
  likelihood: number;
  isProbable: boolean;
  reasons: DuplicateReason[];
  /** Set when a conservatism rule held the score down; explains a low number. */
  capped: DuplicateCap;
}

// ---- thresholds -------------------------------------------------------------

export const DUP = {
  /**
   * A duplicate should READ almost the same. The MO linker calls 0.72 a match
   * and the crew walk 0.78 — both far too generous here, where the two texts
   * are supposed to be two constables' accounts of one event. Below the gate a
   * pair is a method match, not a re-filing, whatever else agrees.
   */
  narrativeGate: 0.86,
  /** Scaling floor: 0.80 scores 0, 0.98 scores 1. */
  narrativeFloor: 0.8,
  narrativeFull: 0.98,
  /** The second file follows the first within days, not months. */
  dateWindowDays: 7,
  /** Raw trigram similarity at which two written names are the same person. */
  personFloor: 0.6,
  personFull: 0.95,
  /** Below this the people are NOT considered matched, and the cap applies. */
  personGate: 0.72,
  /** At or above this the pair is worth an officer's time. */
  threshold: 0.62,
  /**
   * Two burglaries on the same street in the same week are not a duplicate.
   * Without a matching complainant or victim the pair is at most a suspicious
   * coincidence, so everything the other signals earn is held below the bar —
   * the officer can still see the pair in a full scan, but it never asserts.
   */
  noPersonCap: 0.55,
  /**
   * And the reverse: the same victim robbed twice in a fortnight is two crimes,
   * not one file typed twice. People matching cannot rescue narratives that
   * describe different events.
   */
  weakNarrativeCap: 0.45,
  /** A signal is listed as a reason once it clears this sub-score. */
  reasonFires: 0.25,
} as const;

/**
 * Weights, and why.
 *
 *  narrative .35 — the strongest single indicator, but alone it is exactly the
 *                  false positive we are trying to avoid, so it is under half.
 *  people    .30 — nearly as heavy, because it is what separates "same kind of
 *                  crime" from "same crime". Also the gate below.
 *  date      .15 — corroboration. Two files days apart is what a re-filing
 *                  looks like; it is weak evidence on its own in a busy week.
 *  station   .10 — a same-station pair is usually a clerical re-entry; the
 *                  cross-station case is the whole point of the feature, so
 *                  this can never be a large share.
 *  crimeType .10 — cheap agreement, easily coincidental. Small on purpose.
 */
const WEIGHTS: Record<DuplicateSignalName, number> = {
  narrative: 0.35,
  people: 0.3,
  date: 0.15,
  station: 0.1,
  crimeType: 0.1,
};

// Different-district is deliberately not zero: an incident reported twice
// across a boundary is the case the officer most needs told about. It is just
// not, by itself, evidence that the two files are the same event.
const STATION_SCORE: Record<StationRelation, number> = {
  same: 1,
  sameDistrict: 0.6,
  otherDistrict: 0.15,
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Pure scoring — takes signal values that are already fetched and returns the
 * likelihood plus the reasons behind it. No database, no network, so the whole
 * judgement is testable on its own.
 */
export function scoreDuplicate(s: DuplicateSignals): DuplicateScore {
  const sub: Record<DuplicateSignalName, number> = {
    narrative: clamp01((s.narrative - DUP.narrativeFloor) / (DUP.narrativeFull - DUP.narrativeFloor)),
    people: clamp01((s.personMatch - DUP.personFloor) / (DUP.personFull - DUP.personFloor)),
    date: s.dayGap == null ? 0 : clamp01(1 - Math.abs(s.dayGap) / DUP.dateWindowDays),
    station: STATION_SCORE[s.station],
    crimeType: s.sameSubHead ? 1 : 0,
  };

  const names = Object.keys(WEIGHTS) as DuplicateSignalName[];
  let likelihood = names.reduce((acc, k) => acc + sub[k] * WEIGHTS[k], 0);

  // Conservatism. Both caps are about refusing to assert, not about hiding.
  let capped: DuplicateCap = null;
  if (s.personMatch < DUP.personGate && likelihood > DUP.noPersonCap) {
    likelihood = DUP.noPersonCap;
    capped = "no-person";
  }
  if (s.narrative < DUP.narrativeGate && likelihood > DUP.weakNarrativeCap) {
    likelihood = DUP.weakNarrativeCap;
    capped = "weak-narrative";
  }

  const reasons: DuplicateReason[] = names
    .filter((k) => sub[k] >= DUP.reasonFires)
    .map((k) => ({ signal: k, weight: Number((sub[k] * WEIGHTS[k]).toFixed(3)), label: labelFor(k, s) }))
    .sort((a, b) => b.weight - a.weight);

  return { likelihood: Number(likelihood.toFixed(3)), isProbable: likelihood >= DUP.threshold, reasons, capped };
}

function labelFor(k: DuplicateSignalName, s: DuplicateSignals): string {
  switch (k) {
    case "narrative":
      return `Narratives read ${Math.round(s.narrative * 100)}% alike`;
    case "people":
      return s.personLabel
        ? `Same person named in both — ${s.personLabel}`
        : "Complainant or victim name matches";
    case "date": {
      const g = Math.round(Math.abs(s.dayGap ?? 0));
      return g === 0 ? "Same incident date" : `Incidents ${g} day${g === 1 ? "" : "s"} apart`;
    }
    case "station":
      return s.station === "same" ? "Filed at the same station" : "Filed at a station in the same district";
    case "crimeType":
      return "Same crime sub-head";
  }
}

// ---- name matching ----------------------------------------------------------

// Honorifics and the "s/o", "w/o" tails are noise in the register; two clerks
// writing the same complainant rarely agree on them.
const NAME_NOISE = /\b(sri|shri|smt|smti|kum|kumari|mr|mrs|ms|md|dr)\b\.?/gi;

function normaliseName(n: string): string {
  return n
    .toLowerCase()
    .replace(NAME_NOISE, " ")
    .replace(/\b[swd]\s*\/\s*o\b.*$/i, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best match between two files' people. Roles are compared across each other,
 * not only like for like: when one incident is filed twice the person who was
 * the complainant in the first file is often recorded as a victim in the
 * second, and insisting on the same role would miss exactly those pairs.
 */
export function bestNameMatch(
  a: string[],
  b: string[]
): { score: number; label: string | null } {
  let best = 0;
  let label: string | null = null;
  for (const rawA of a) {
    const na = normaliseName(rawA);
    if (na.length < 3) continue;
    for (const rawB of b) {
      const nb = normaliseName(rawB);
      if (nb.length < 3) continue;
      const s = na === nb ? 1 : similarity(na, nb);
      if (s > best) {
        best = s;
        label = na === nb ? rawA.trim() : `${rawA.trim()} / ${rawB.trim()}`;
      }
    }
  }
  return { score: best, label: best >= DUP.personFloor ? label : null };
}

// ---- database ---------------------------------------------------------------

export interface DuplicateOptions {
  /** How many nearest narratives to consider per case. */
  topK?: number;
  /** Only return pairs at or above this likelihood. */
  minLikelihood?: number;
  /** Narrative floor applied in SQL before anything else is fetched. */
  minNarrative?: number;
  /** How far apart the two incidents may be. */
  windowDays?: number;
  districtId?: number | null;
}

export interface DuplicateCandidate {
  id: number;
  crimeNo: string | null;
  crimeType: string | null;
  station: string | null;
  district: string | null;
  status: string | null;
  registered: string | null;
  incident: string | null;
  briefFacts: string | null;
  sameStation: boolean;
  likelihood: number;
  reasons: DuplicateReason[];
  signals: DuplicateSignals;
}

const DEFAULTS = {
  topK: 8,
  minNarrative: Number(process.env.DUP_MIN_NARRATIVE ?? DUP.narrativeGate),
  windowDays: Number(process.env.DUP_WINDOW_DAYS ?? DUP.dateWindowDays),
};

type NameRow = { case_id: number; name: string | null };

/** Everyone named as a complainant or a victim in the given files, in one pass. */
async function peopleOf(db: Db, caseIds: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (!caseIds.length) return out;
  const rows = await db.$queryRawUnsafe<NameRow[]>(
    `SELECT "CaseMasterID" AS case_id, "ComplainantName" AS name FROM "ComplainantDetails"
       WHERE "CaseMasterID" = ANY($1::int[]) AND "ComplainantName" IS NOT NULL
     UNION ALL
     SELECT "CaseMasterID" AS case_id, "VictimName" AS name FROM "Victim"
       WHERE "CaseMasterID" = ANY($1::int[]) AND "VictimName" IS NOT NULL`,
    caseIds
  );
  for (const r of rows) {
    if (!r.name) continue;
    (out.get(r.case_id) ?? out.set(r.case_id, []).get(r.case_id)!).push(r.name);
  }
  return out;
}

type CandidateRow = {
  id: number; crime_no: string | null; crime_type: string | null; station: string | null;
  district: string | null; status: string | null; registered: string | null; incident: string | null;
  brief_facts: string | null; score: number; day_gap: number | null;
  same_station: boolean; same_district: boolean; same_sub_head: boolean;
};

function relation(r: { same_station: boolean; same_district: boolean }): StationRelation {
  return r.same_station ? "same" : r.same_district ? "sameDistrict" : "otherDistrict";
}

/**
 * The probable duplicates of one FIR, ranked.
 *
 * The narrative floor and the date window are applied in SQL so the expensive
 * part — pulling every complainant and victim name — only ever runs over a
 * handful of rows. The vector index does the search; the scoring decides.
 */
export async function findDuplicatesOf(
  caseId: number,
  opts: DuplicateOptions = {}
): Promise<DuplicateCandidate[]> {
  const cfg = { ...DEFAULTS, minLikelihood: DUP.threshold, ...opts };
  const db = scopedClient(opts.districtId ?? null);

  const rows = await db.$queryRawUnsafe<CandidateRow[]>(
    `WITH src AS (
       SELECT cm."CaseMasterID" AS id, cm."BriefFactsEmbedding" AS e,
              COALESCE(cm."IncidentFromDate", cm."CrimeRegisteredDate") AS occurred,
              cm."PoliceStationID" AS station_id, u."DistrictID" AS district_id,
              cm."CrimeMinorHeadID" AS sub_head
       FROM "CaseMaster" cm
       LEFT JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
       WHERE cm."CaseMasterID" = $1
     )
     SELECT cm."CaseMasterID" AS id, cm."CrimeNo" AS crime_no, csh."CrimeHeadName" AS crime_type,
            u."UnitName" AS station, d."DistrictName" AS district, cs."CaseStatusName" AS status,
            to_char(cm."CrimeRegisteredDate", 'YYYY-MM-DD') AS registered,
            to_char(COALESCE(cm."IncidentFromDate", cm."CrimeRegisteredDate"), 'YYYY-MM-DD') AS incident,
            cm."BriefFacts" AS brief_facts,
            1 - (cm."BriefFactsEmbedding" <=> src.e) AS score,
            EXTRACT(EPOCH FROM (COALESCE(cm."IncidentFromDate", cm."CrimeRegisteredDate") - src.occurred)) / 86400.0 AS day_gap,
            (cm."PoliceStationID" IS NOT DISTINCT FROM src.station_id) AS same_station,
            (u."DistrictID" IS NOT DISTINCT FROM src.district_id) AS same_district,
            (cm."CrimeMinorHeadID" IS NOT DISTINCT FROM src.sub_head) AS same_sub_head
     FROM "CaseMaster" cm
     LEFT JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
     LEFT JOIN "District" d ON d."DistrictID" = u."DistrictID"
     LEFT JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
     LEFT JOIN "CaseStatusMaster" cs ON cs."CaseStatusID" = cm."CaseStatusID",
     src
     WHERE cm."BriefFactsEmbedding" IS NOT NULL AND src.e IS NOT NULL
       AND cm."CaseMasterID" <> src.id
       AND 1 - (cm."BriefFactsEmbedding" <=> src.e) >= $3
       AND (
         src.occurred IS NULL
         OR ABS(EXTRACT(EPOCH FROM (COALESCE(cm."IncidentFromDate", cm."CrimeRegisteredDate") - src.occurred))) <= $4 * 86400
       )
     ORDER BY cm."BriefFactsEmbedding" <=> src.e
     LIMIT $2`,
    caseId,
    cfg.topK,
    cfg.minNarrative,
    cfg.windowDays
  );
  if (!rows.length) return [];

  const names = await peopleOf(db, [caseId, ...rows.map((r) => r.id)]);
  const seedNames = names.get(caseId) ?? [];

  return rows
    .map((r) => {
      const person = bestNameMatch(seedNames, names.get(r.id) ?? []);
      const signals: DuplicateSignals = {
        narrative: Number(r.score),
        dayGap: r.day_gap == null ? null : Number(r.day_gap),
        station: relation(r),
        sameSubHead: Boolean(r.same_sub_head),
        personMatch: person.score,
        personLabel: person.label,
      };
      const scored = scoreDuplicate(signals);
      return {
        id: r.id,
        crimeNo: r.crime_no,
        crimeType: r.crime_type,
        station: r.station,
        district: r.district,
        status: r.status,
        registered: r.registered,
        incident: r.incident,
        briefFacts: r.brief_facts,
        sameStation: signals.station === "same",
        likelihood: scored.likelihood,
        reasons: scored.reasons,
        signals,
      };
    })
    .filter((c) => c.likelihood >= cfg.minLikelihood)
    .sort((a, b) => b.likelihood - a.likelihood);
}

// ---- corpus scan (alert path) ----------------------------------------------

export interface DuplicateScanOptions extends DuplicateOptions {
  /** Only look at cases registered in the last N days. */
  recentDays?: number;
  /** How many recent cases to check per run — the same budget the MO linker keeps. */
  scanCases?: number;
  /** Cap on pairs returned. */
  maxPairs?: number;
}

export interface DuplicateScanHit {
  caseId: number;
  crimeNo: string | null;
  station: string | null;
  districtId: number;
  districtName: string;
  registered: string | null;
  matchId: number;
  matchCrimeNo: string | null;
  matchStation: string | null;
  matchDistrictId: number;
  matchDistrictName: string;
  matchRegistered: string | null;
  sameStation: boolean;
  likelihood: number;
  reasons: DuplicateReason[];
}

type ScanRow = {
  case_id: number; crime_no: string | null; station: string | null; station_id: number | null;
  district_id: number; district_name: string; registered: string | null;
  match_id: number; match_crime_no: string | null; match_station: string | null; match_station_id: number | null;
  match_district_id: number; match_district_name: string; match_registered: string | null;
  score: number; day_gap: number | null; same_sub_head: boolean;
};

const SCAN_DEFAULTS = {
  recentDays: Number(process.env.ALERT_DUP_RECENT_DAYS ?? 30),
  scanCases: 60,
  maxPairs: 5,
  topK: 3,
};

/**
 * Corpus-wide sweep for the alert engine. Bounded exactly like the MO linker —
 * only the last few weeks of registrations, capped, one LATERAL nearest-
 * neighbour lookup each served by the pgvector index.
 */
export async function scanDuplicates(opts: DuplicateScanOptions = {}): Promise<DuplicateScanHit[]> {
  const cfg = { ...DEFAULTS, ...SCAN_DEFAULTS, minLikelihood: DUP.threshold, ...opts };
  const db = scopedClient(opts.districtId ?? null);

  const rows = await db.$queryRawUnsafe<ScanRow[]>(
    `WITH recent AS (
       SELECT cm."CaseMasterID" AS case_id, cm."CrimeNo" AS crime_no, cm."BriefFactsEmbedding" AS e,
              COALESCE(cm."IncidentFromDate", cm."CrimeRegisteredDate") AS occurred,
              cm."PoliceStationID" AS station_id, u."UnitName" AS station,
              d."DistrictID" AS district_id, d."DistrictName" AS district_name,
              cm."CrimeMinorHeadID" AS sub_head,
              to_char(cm."CrimeRegisteredDate", 'YYYY-MM-DD') AS registered
       FROM "CaseMaster" cm
       JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
       JOIN "District" d ON d."DistrictID" = u."DistrictID"
       WHERE cm."BriefFactsEmbedding" IS NOT NULL
         AND cm."CrimeRegisteredDate" >= NOW() - ($1 || ' days')::interval
       ORDER BY cm."CrimeRegisteredDate" DESC
       LIMIT $2
     )
     SELECT r.case_id, r.crime_no, r.station, r.station_id, r.district_id, r.district_name, r.registered,
            m.match_id, m.match_crime_no, m.match_station, m.match_station_id,
            m.match_district_id, m.match_district_name, m.match_registered,
            m.score, m.day_gap, m.same_sub_head
     FROM recent r
     CROSS JOIN LATERAL (
       SELECT cm2."CaseMasterID" AS match_id, cm2."CrimeNo" AS match_crime_no,
              u2."UnitName" AS match_station, cm2."PoliceStationID" AS match_station_id,
              d2."DistrictID" AS match_district_id, d2."DistrictName" AS match_district_name,
              to_char(cm2."CrimeRegisteredDate", 'YYYY-MM-DD') AS match_registered,
              1 - (cm2."BriefFactsEmbedding" <=> r.e) AS score,
              EXTRACT(EPOCH FROM (COALESCE(cm2."IncidentFromDate", cm2."CrimeRegisteredDate") - r.occurred)) / 86400.0 AS day_gap,
              (cm2."CrimeMinorHeadID" IS NOT DISTINCT FROM r.sub_head) AS same_sub_head
       FROM "CaseMaster" cm2
       JOIN "Unit" u2 ON u2."UnitID" = cm2."PoliceStationID"
       JOIN "District" d2 ON d2."DistrictID" = u2."DistrictID"
       WHERE cm2."BriefFactsEmbedding" IS NOT NULL
         AND cm2."CaseMasterID" <> r.case_id
         AND 1 - (cm2."BriefFactsEmbedding" <=> r.e) >= $3
         AND (
           r.occurred IS NULL
           OR ABS(EXTRACT(EPOCH FROM (COALESCE(cm2."IncidentFromDate", cm2."CrimeRegisteredDate") - r.occurred))) <= $4 * 86400
         )
       ORDER BY cm2."BriefFactsEmbedding" <=> r.e
       LIMIT $5
     ) m`,
    String(Math.floor(cfg.recentDays)),
    cfg.scanCases,
    cfg.minNarrative,
    cfg.windowDays,
    cfg.topK
  );
  if (!rows.length) return [];

  const names = await peopleOf(db, [...new Set(rows.flatMap((r) => [r.case_id, r.match_id]))]);

  // A duplicate is symmetric, so (a,b) and (b,a) are one finding. Key on the
  // ordered pair once, keeping whichever direction scored higher.
  const byPair = new Map<string, DuplicateScanHit>();
  for (const r of rows) {
    const person = bestNameMatch(names.get(r.case_id) ?? [], names.get(r.match_id) ?? []);
    const signals: DuplicateSignals = {
      narrative: Number(r.score),
      dayGap: r.day_gap == null ? null : Number(r.day_gap),
      station:
        r.station_id != null && r.station_id === r.match_station_id
          ? "same"
          : r.district_id === r.match_district_id
            ? "sameDistrict"
            : "otherDistrict",
      sameSubHead: Boolean(r.same_sub_head),
      personMatch: person.score,
      personLabel: person.label,
    };
    const scored = scoreDuplicate(signals);
    if (scored.likelihood < cfg.minLikelihood) continue;

    const key = r.case_id < r.match_id ? `${r.case_id}:${r.match_id}` : `${r.match_id}:${r.case_id}`;
    const hit: DuplicateScanHit = {
      caseId: r.case_id,
      crimeNo: r.crime_no,
      station: r.station,
      districtId: r.district_id,
      districtName: r.district_name,
      registered: r.registered,
      matchId: r.match_id,
      matchCrimeNo: r.match_crime_no,
      matchStation: r.match_station,
      matchDistrictId: r.match_district_id,
      matchDistrictName: r.match_district_name,
      matchRegistered: r.match_registered,
      sameStation: signals.station === "same",
      likelihood: scored.likelihood,
      reasons: scored.reasons,
    };
    const seen = byPair.get(key);
    if (!seen || seen.likelihood < hit.likelihood) byPair.set(key, hit);
  }

  return [...byPair.values()].sort((a, b) => b.likelihood - a.likelihood).slice(0, cfg.maxPairs);
}
