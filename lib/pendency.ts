import type { Db } from "./db";
import { predictChargesheetRisk, type RiskContribution } from "./risk-model";

/**
 * "My Desk" — the pendency screen an SHO opens every morning.
 *
 * One question: of the cases still on my hands, which one is closest to
 * slipping? Everything here is derived, nothing is stored — the desk is a view
 * over CaseMaster, its arrests and its (absent) chargesheet, read inside the
 * caller's scope so a district-posted officer never sees another district.
 *
 * The clock arithmetic and the attention ordering are pure functions below,
 * with no database and no clock of their own (`now` is always passed in), so
 * the rules can be tested and argued with directly — see test/pendency.test.ts.
 */

// ---- The statutory clock ---------------------------------------------------
//
// BNSS s.187(3) (CrPC s.167(2) before it): an accused must be charge-sheeted
// within 90 days for offences punishable with death, life, or imprisonment of
// not less than ten years, and within 60 days for everything else — otherwise
// default bail follows.
//
// What the data actually supports: the schema carries GravityOffence, and the
// only values it holds are 'Heinous' and 'Non-Heinous'. That is NOT the same
// distinction as "punishable with ten years or more" — the sections that would
// settle it live in ActSectionAssociation, but Section carries no punishment
// column, so the true ten-year test cannot be evaluated from this database.
// Heinous is the closest classification the schema owns, so we use it as a
// declared proxy and label every row with the basis it was decided on, rather
// than flattening everyone to 90 days and calling it precision.
export const CS_LIMIT_GRAVE_DAYS = 90;
export const CS_LIMIT_STANDARD_DAYS = 60;

/** Inside this many days of the deadline a case reads as "due soon", not merely open. */
export const CS_DUE_SOON_DAYS = 15;

export type ClockBasis = "heinous" | "non-heinous" | "assumed";
export type ClockState = "overdue" | "dueSoon" | "onTrack";

export interface ChargesheetClock {
  limitDays: number;
  basis: ClockBasis;
  /** Days left before the limit; negative once it has passed. */
  daysRemaining: number;
  /** 0 unless the limit has passed, then how far past it. */
  daysOverdue: number;
  state: ClockState;
}

/**
 * The limit this case is measured against. Unknown gravity falls back to the
 * 90-day clock and is labelled "assumed": guessing the shorter limit would
 * paint an SHO's desk red on the strength of a missing lookup value.
 */
export function chargesheetLimitDays(gravity: string | null | undefined): { limitDays: number; basis: ClockBasis } {
  const g = (gravity ?? "").trim().toLowerCase();
  if (g === "heinous") return { limitDays: CS_LIMIT_GRAVE_DAYS, basis: "heinous" };
  if (g === "non-heinous" || g === "non heinous") return { limitDays: CS_LIMIT_STANDARD_DAYS, basis: "non-heinous" };
  return { limitDays: CS_LIMIT_GRAVE_DAYS, basis: "assumed" };
}

/**
 * The clock for one open case. Day `limitDays` is still inside the limit; the
 * case is overdue from day `limitDays + 1` — a 61-day-old case on a 60-day
 * clock is one day past, not zero.
 */
export function chargesheetClock(daysSinceFir: number, gravity: string | null | undefined): ChargesheetClock {
  const { limitDays, basis } = chargesheetLimitDays(gravity);
  const daysRemaining = limitDays - Math.max(0, Math.trunc(daysSinceFir));
  const daysOverdue = daysRemaining < 0 ? -daysRemaining : 0;
  const state: ClockState = daysRemaining < 0 ? "overdue" : daysRemaining <= CS_DUE_SOON_DAYS ? "dueSoon" : "onTrack";
  return { limitDays, basis, daysRemaining, daysOverdue, state };
}

/** Whole days between two calendar dates, UTC — @db.Date values land on UTC midnight. */
export function daysSince(from: Date | string, now: Date): number {
  const d = typeof from === "string" ? new Date(from) : from;
  const a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((b - a) / 86_400_000);
}

// ---- Attention ordering ----------------------------------------------------

/** The minimum a row needs to be ranked — the API row is a superset of this. */
export interface AttentionInput {
  caseId: number;
  daysSinceFir: number;
  hasArrest: boolean;
  clock: Pick<ChargesheetClock, "daysRemaining">;
  /** Chargesheet likelihood from the local model, 0..1. */
  riskProbability: number;
}

/**
 * THE RULE: sort by days remaining on the statutory clock, ascending — the most
 * overdue case first, then the closest to its deadline, then the rest.
 *
 * That single key is chosen because the statutory clock is the only deadline on
 * this screen with a consequence attached: miss it and the accused takes
 * default bail. Case age alone would rank a 70-day-old heinous case above a
 * 65-day-old ordinary one, which is backwards — the ordinary one is already
 * five days past its limit.
 *
 * Ties break, in order:
 *   1. no arrest before an arrest — nothing else can move until someone is held;
 *   2. lower chargesheet likelihood first — the model says this one is drifting;
 *   3. older FIR first;
 *   4. case id, so the list is stable across reloads.
 */
export function compareAttention(a: AttentionInput, b: AttentionInput): number {
  if (a.clock.daysRemaining !== b.clock.daysRemaining) return a.clock.daysRemaining - b.clock.daysRemaining;
  if (a.hasArrest !== b.hasArrest) return a.hasArrest ? 1 : -1;
  if (a.riskProbability !== b.riskProbability) return a.riskProbability - b.riskProbability;
  if (a.daysSinceFir !== b.daysSinceFir) return b.daysSinceFir - a.daysSinceFir;
  return a.caseId - b.caseId;
}

export function sortByAttention<T extends AttentionInput>(rows: T[]): T[] {
  return [...rows].sort(compareAttention);
}

// ---- The desk itself -------------------------------------------------------

export type PendencyFilter = "all" | "overdue" | "noArrest";

export interface PendencyRow extends AttentionInput {
  crimeNo: string | null;
  caseNo: string | null;
  dateRegistered: string | null;
  crimeGroup: string;
  station: string;
  district: string;
  status: string;
  gravity: string | null;
  /** The committing court, when one is recorded. The schema has no hearing-date
   *  column anywhere, so the desk shows the court and stays silent about dates
   *  rather than inventing a next-hearing it cannot know. */
  court: string | null;
  nextHearingDate: null;
  arrestCount: number;
  clock: ChargesheetClock;
  risk: { probability: number; label: string; contributions: RiskContribution[] };
}

export interface PendencySummary {
  openCases: number;
  overdue: number;
  noArrest: number;
  medianAgeDays: number | null;
}

export interface Desk {
  rows: PendencyRow[];
  summary: PendencySummary;
  generatedAt: string;
}

type DeskSqlRow = {
  case_id: number;
  crime_no: string | null;
  case_no: string | null;
  date_registered: Date | null;
  crime_group: string;
  station: string;
  district: string;
  status: string;
  gravity: string | null;
  court: string | null;
  arrest_count: number;
  victim_count: number;
  accused_count: number;
};

// One district's live pendency is in the hundreds, not the tens of thousands.
// The cap exists so a statewide HQ user cannot pull the whole corpus into
// memory to sort it. The summary is counted in SQL over every open case in
// scope rather than over the fetched page: a headline that silently reports the
// cap ("2,000 open") instead of the truth is worse than no headline at all.
const FETCH_CAP = 2000;

/**
 * The canonical definition of "open" in this codebase. Repeated by both queries
 * here so the count can never describe a different set of cases than the list
 * does, and exported so nothing else has to re-invent it: crew.ts imports this
 * rather than keeping a fourth definition of its own. Measured against the
 * corpus, "no chargesheet row" alone is NOT open — 5,135 Closed and 1,909 False
 * Case files also lack one, so testing the chargesheet by itself calls 15,839
 * cases open where this predicate calls 8,795.
 *
 * The one deliberate divergence is custody.ts's LIVE_PREDICATE, which is wider
 * on purpose and documented there.
 *
 * Written against the aliases `cm` (CaseMaster) and `cs` (CaseStatusMaster).
 */
export const OPEN_PREDICATE = `
      cm."CrimeRegisteredDate" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "ChargesheetDetails" csd WHERE csd."CaseMasterID" = cm."CaseMasterID")
      AND COALESCE(cs."CaseStatusName", 'Unknown') NOT IN ('Charge Sheeted', 'Closed', 'False Case')`;

/**
 * Open = no chargesheet filed AND not already disposed. A case marked Closed or
 * False Case is off the desk even without a chargesheet — it is not pending on
 * anyone. Cases with no registration date are dropped: with no FIR date there
 * is no clock to run, and a fabricated day zero would be the worst of both.
 */
export async function buildDesk(
  db: Db,
  { filter = "all", limit = 100, now = new Date() }: { filter?: PendencyFilter; limit?: number; now?: Date } = {}
): Promise<Desk> {
  const sql = `
    SELECT
      cm."CaseMasterID"                         AS case_id,
      cm."CrimeNo"                              AS crime_no,
      cm."CaseNo"                               AS case_no,
      cm."CrimeRegisteredDate"                  AS date_registered,
      ch."CrimeGroupName"                       AS crime_group,
      u."UnitName"                              AS station,
      d."DistrictName"                          AS district,
      COALESCE(cs."CaseStatusName", 'Unknown')  AS status,
      go."LookupValue"                          AS gravity,
      co."CourtName"                            AS court,
      (SELECT COUNT(*)::int FROM "ArrestSurrender" a WHERE a."CaseMasterID" = cm."CaseMasterID") AS arrest_count,
      (SELECT COUNT(*)::int FROM "Victim"          v WHERE v."CaseMasterID" = cm."CaseMasterID") AS victim_count,
      (SELECT COUNT(*)::int FROM "Accused"        ac WHERE ac."CaseMasterID" = cm."CaseMasterID") AS accused_count
    FROM "CaseMaster" cm
    JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
    JOIN "Unit"      u  ON u."UnitID"       = cm."PoliceStationID"
    JOIN "District"  d  ON d."DistrictID"   = u."DistrictID"
    LEFT JOIN "CaseStatusMaster" cs ON cs."CaseStatusID"     = cm."CaseStatusID"
    LEFT JOIN "GravityOffence"   go ON go."GravityOffenceID" = cm."GravityOffenceID"
    LEFT JOIN "Court"            co ON co."CourtID"          = cm."CourtID"
    WHERE ${OPEN_PREDICATE}
    ORDER BY cm."CrimeRegisteredDate" ASC
    LIMIT ${FETCH_CAP}
  `;

  const [raw, summary] = await Promise.all([
    db.$queryRawUnsafe<DeskSqlRow[]>(sql),
    deskSummary(db, now),
  ]);
  const all = sortByAttention(raw.map((r) => toRow(r, now)));
  const filtered =
    filter === "overdue" ? all.filter((r) => r.clock.state === "overdue")
    : filter === "noArrest" ? all.filter((r) => !r.hasArrest)
    : all;

  return { rows: filtered.slice(0, Math.max(1, limit)), summary, generatedAt: now.toISOString() };
}

function toRow(r: DeskSqlRow, now: Date): PendencyRow {
  const daysSinceFir = r.date_registered ? daysSince(r.date_registered, now) : 0;
  const hasArrest = Number(r.arrest_count) > 0;
  const clock = chargesheetClock(daysSinceFir, r.gravity);

  // The same interpretable model the predictRisk tool falls back to
  // (lib/agent/tools.ts runPredictRisk). Called directly rather than through the
  // tool: the tool reaches for Catalyst and a Request, neither of which belongs
  // on a pendency read — and the desk wants the per-feature contributions.
  // `heinous` comes from the case's own GravityOffence rather than the tool's
  // crime-group heuristic, because here we have the classification itself.
  const risk = predictChargesheetRisk({
    hasArrest,
    daysSinceRegistered: daysSinceFir,
    heinous: (r.gravity ?? "").trim().toLowerCase() === "heinous",
    victimCount: Number(r.victim_count),
    accusedCount: Number(r.accused_count),
  });

  return {
    caseId: Number(r.case_id),
    crimeNo: r.crime_no,
    caseNo: r.case_no,
    dateRegistered: r.date_registered ? new Date(r.date_registered).toISOString().slice(0, 10) : null,
    crimeGroup: r.crime_group,
    station: r.station,
    district: r.district,
    status: r.status,
    gravity: r.gravity,
    court: r.court,
    nextHearingDate: null,
    daysSinceFir,
    hasArrest,
    arrestCount: Number(r.arrest_count),
    clock,
    riskProbability: risk.probability,
    risk: { probability: risk.probability, label: risk.label, contributions: risk.contributions },
  };
}

/**
 * Counts the whole desk in the database, so the strip keeps its meaning both
 * when a filter is on and when the desk is larger than one page. The clock
 * thresholds are repeated here in SQL; they must stay in step with
 * chargesheetLimitDays(), which is what the rows themselves are scored with.
 */
async function deskSummary(db: Db, now: Date): Promise<PendencySummary> {
  const rows = await db.$queryRawUnsafe<
    { open_cases: number; overdue: number; no_arrest: number; median_age: number | null }[]
  >(`
    WITH open_cases AS (
      SELECT
        (DATE_PART('day', $1::timestamptz - cm."CrimeRegisteredDate"))::int AS age,
        CASE WHEN LOWER(COALESCE(go."LookupValue", '')) IN ('non-heinous', 'non heinous')
             THEN ${CS_LIMIT_STANDARD_DAYS} ELSE ${CS_LIMIT_GRAVE_DAYS} END AS limit_days,
        EXISTS (SELECT 1 FROM "ArrestSurrender" a WHERE a."CaseMasterID" = cm."CaseMasterID") AS has_arrest
      FROM "CaseMaster" cm
      LEFT JOIN "CaseStatusMaster" cs ON cs."CaseStatusID"     = cm."CaseStatusID"
      LEFT JOIN "GravityOffence"   go ON go."GravityOffenceID" = cm."GravityOffenceID"
      WHERE ${OPEN_PREDICATE}
    )
    SELECT COUNT(*)::int                                             AS open_cases,
           COUNT(*) FILTER (WHERE age > limit_days)::int             AS overdue,
           COUNT(*) FILTER (WHERE NOT has_arrest)::int               AS no_arrest,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY age)          AS median_age
    FROM open_cases
  `, now);

  const r = rows[0];
  return {
    openCases: Number(r?.open_cases ?? 0),
    overdue: Number(r?.overdue ?? 0),
    noArrest: Number(r?.no_arrest ?? 0),
    medianAgeDays: r?.median_age == null ? null : Math.round(Number(r.median_age)),
  };
}

/** The same counts over a set of rows already in hand. Kept for the tests, and
 *  for any caller holding a complete desk rather than a page of one. */
export function summarise(rows: PendencyRow[]): PendencySummary {
  const ages = rows.map((r) => r.daysSinceFir).sort((a, b) => a - b);
  const mid = Math.floor(ages.length / 2);
  const medianAgeDays =
    ages.length === 0 ? null
    : ages.length % 2 === 1 ? ages[mid]
    : Math.round((ages[mid - 1] + ages[mid]) / 2);

  return {
    openCases: rows.length,
    overdue: rows.filter((r) => r.clock.state === "overdue").length,
    noArrest: rows.filter((r) => !r.hasArrest).length,
    medianAgeDays,
  };
}
