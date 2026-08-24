import type { Db } from "./db";
import { STALE_ACTION_DAYS } from "./caseStatus";
import { chargesheetClock, daysSince, CS_DUE_SOON_DAYS, CS_LIMIT_GRAVE_DAYS, CS_LIMIT_STANDARD_DAYS, type ChargesheetClock } from "./pendency";

/**
 * Custody position — of the accused named on a case, how many have ever been
 * brought in, and how long ago the last such action was.
 *
 * This extends the pendency desk (lib/pendency.ts) with the one question that
 * screen could only answer as a yes/no: "has anyone been arrested". A case with
 * five accused and one arrest is not the same case as one with a single accused
 * in custody, and the desk was showing them identically.
 *
 * WHAT THIS DOES NOT KNOW — and the UI says so once, via `custody.caveat`:
 * ArrestSurrender carries ArrestSurrenderTypeID, ArrestSurrenderDate,
 * AccusedMasterID and IsAccused, and nothing else. There is no bail column, no
 * release date, and no custody-status column anywhere in the schema. So this
 * module reports whether a person was ever *brought in*, never whether they are
 * *in custody today*. Nothing here should be read as a bail position.
 *
 * ARREST vs SURRENDER: ArrestSurrenderTypeID is an unconstrained Int? with no
 * lookup table in the schema — nothing maps 1 to "arrest" and 2 to "surrender".
 * prisma/seed.ts writes the literal 1 for every row it inserts, so even the
 * demo corpus carries a single undifferentiated value. We therefore count
 * "brought in" and keep arrest and surrender fused; `typeResolution` below
 * carries the distinct ids actually present so the screen can report the basis
 * instead of implying a distinction the data cannot support.
 */

export { STALE_ACTION_DAYS } from "./caseStatus";

export type CustodyFlag = "csNoCustody" | "stale";

export interface CustodyPosition {
  /** Accused named on the case. 0 is a real answer here — see `coverage`. */
  accusedCount: number;
  /** Distinct accused with at least one arrest-or-surrender record against them. */
  broughtIn: number;
  neverBroughtIn: number;
  /**
   * broughtIn / accusedCount, or null when no accused is recorded at all.
   * Null rather than 0 or NaN: "nobody has been brought in" and "nobody has
   * been named yet" are different failures and must not render the same.
   */
  coverage: number | null;
  /** Custody records on the case, including any not tied to a named accused. */
  actions: number;
  lastActionDate: string | null;
  daysSinceLastAction: number | null;
  flags: CustodyFlag[];
}

export interface CustodyStateInput {
  accusedCount: number;
  broughtIn: number;
  actions: number;
  chargesheeted: boolean;
  /** Last arrest/surrender date, or null when there has never been one. */
  lastActionDate: Date | string | null;
  daysSinceFir: number;
  /** Days left on the statutory chargesheet clock; negative once past it. */
  clockDaysRemaining: number;
  now: Date;
}

/**
 * The whole derivation, as a pure function — no database, no clock of its own.
 * The two flags are the states worth an officer's attention:
 *
 *   csNoCustody — the case has been charge-sheeted and not one of its accused
 *     was ever brought in. Lawful (a chargesheet against an absconder is), but
 *     it is the shape a paper-only disposal takes, and it should be looked at.
 *
 *   stale — nothing has happened on custody for STALE_ACTION_DAYS while the
 *     chargesheet clock is inside its last CS_DUE_SOON_DAYS. Either half alone
 *     is ordinary; together they are a case running out of time with nobody
 *     working it. Charge-sheeted cases are excluded: their clock has stopped,
 *     so silence on custody no longer costs anything.
 */
export function custodyPosition(input: CustodyStateInput): CustodyPosition {
  const accusedCount = Math.max(0, Math.trunc(input.accusedCount));
  // An arrest can carry a null AccusedMasterID, and the same accused can have
  // more than one record; both are capped against the roll so coverage can
  // never exceed 1 and neverBroughtIn can never go negative.
  const broughtIn = Math.min(Math.max(0, Math.trunc(input.broughtIn)), accusedCount);
  const coverage = accusedCount === 0 ? null : broughtIn / accusedCount;

  const daysSinceLastAction = input.lastActionDate ? daysSince(input.lastActionDate, input.now) : null;
  // Never a single action means the inaction is as old as the FIR itself.
  const inactionDays = daysSinceLastAction ?? Math.max(0, Math.trunc(input.daysSinceFir));

  const flags: CustodyFlag[] = [];
  if (input.chargesheeted && input.actions === 0) flags.push("csNoCustody");
  if (!input.chargesheeted && inactionDays >= STALE_ACTION_DAYS && input.clockDaysRemaining <= CS_DUE_SOON_DAYS) flags.push("stale");

  return {
    accusedCount,
    broughtIn,
    neverBroughtIn: accusedCount - broughtIn,
    coverage,
    actions: Math.max(0, Math.trunc(input.actions)),
    lastActionDate: input.lastActionDate ? isoDate(input.lastActionDate) : null,
    daysSinceLastAction,
    flags,
  };
}

function isoDate(d: Date | string): string {
  return (typeof d === "string" ? new Date(d) : d).toISOString().slice(0, 10);
}

// ---- The desk column -------------------------------------------------------

export type CustodyFilter = "all" | "none" | "csNoCustody" | "stale";

/**
 * A custody row carries enough of the case to render beside the pendency rows
 * it extends — the desk shows one list, not two — without depending on
 * lib/pendency's risk model, which has nothing to do with custody.
 */
export interface CustodyRow {
  caseId: number;
  crimeNo: string | null;
  crimeGroup: string;
  station: string;
  district: string;
  status: string;
  dateRegistered: string | null;
  daysSinceFir: number;
  chargesheeted: boolean;
  clock: ChargesheetClock;
  custody: CustodyPosition;
}

export interface CustodySummary {
  /** Every live case in scope — charge-sheeted ones included, unlike the desk. */
  liveCases: number;
  /** Cases where not one accused has ever been brought in. */
  noneBroughtIn: number;
  csNoCustody: number;
  stale: number;
  accusedTotal: number;
  broughtInTotal: number;
}

/** What the schema can and cannot say about ArrestSurrenderTypeID, measured. */
export interface CustodyTypeResolution {
  resolved: boolean;
  distinctTypeIds: number[];
  reason: string;
}

export interface CustodyBoard {
  rows: CustodyRow[];
  summary: CustodySummary;
  typeResolution: CustodyTypeResolution;
  generatedAt: string;
}

// Same cap, and the same reason, as lib/pendency: a statewide user must not be
// able to pull the corpus into memory, and the summary is counted in SQL over
// the whole scoped set so it never quietly reports the cap instead of the truth.
const FETCH_CAP = 2000;

/**
 * Live = registered, and not already disposed. Deliberately WIDER than the
 * pendency desk's OPEN_PREDICATE, which also drops charge-sheeted cases: the
 * csNoCustody flag exists precisely to look at charge-sheeted cases, so
 * excluding them would leave that state permanently empty.
 */
const LIVE_PREDICATE = `
      cm."CrimeRegisteredDate" IS NOT NULL
      AND COALESCE(cs."CaseStatusName", 'Unknown') NOT IN ('Closed', 'False Case')`;

const CHARGESHEETED_EXPR = `(
      EXISTS (SELECT 1 FROM "ChargesheetDetails" csd WHERE csd."CaseMasterID" = cm."CaseMasterID")
      OR COALESCE(cs."CaseStatusName", '') = 'Charge Sheeted')`;

type CustodySqlRow = {
  case_id: number;
  crime_no: string | null;
  crime_group: string;
  station: string;
  district: string;
  status: string;
  gravity: string | null;
  date_registered: Date | null;
  chargesheeted: boolean;
  accused_count: number;
  brought_in: number;
  actions: number;
  last_action: Date | null;
};

export async function buildCustodyBoard(
  db: Db,
  { filter = "all", limit = 100, now = new Date() }: { filter?: CustodyFilter; limit?: number; now?: Date } = {}
): Promise<CustodyBoard> {
  const sql = `
    SELECT
      cm."CaseMasterID"                         AS case_id,
      cm."CrimeNo"                              AS crime_no,
      ch."CrimeGroupName"                       AS crime_group,
      u."UnitName"                              AS station,
      d."DistrictName"                          AS district,
      COALESCE(cs."CaseStatusName", 'Unknown')  AS status,
      go."LookupValue"                          AS gravity,
      cm."CrimeRegisteredDate"                  AS date_registered,
      ${CHARGESHEETED_EXPR}                     AS chargesheeted,
      (SELECT COUNT(*)::int FROM "Accused" ac WHERE ac."CaseMasterID" = cm."CaseMasterID") AS accused_count,
      (SELECT COUNT(DISTINCT a."AccusedMasterID")::int FROM "ArrestSurrender" a
         WHERE a."CaseMasterID" = cm."CaseMasterID" AND a."AccusedMasterID" IS NOT NULL) AS brought_in,
      (SELECT COUNT(*)::int FROM "ArrestSurrender" a WHERE a."CaseMasterID" = cm."CaseMasterID") AS actions,
      (SELECT MAX(a."ArrestSurrenderDate") FROM "ArrestSurrender" a WHERE a."CaseMasterID" = cm."CaseMasterID") AS last_action
    FROM "CaseMaster" cm
    JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
    JOIN "Unit"      u  ON u."UnitID"       = cm."PoliceStationID"
    JOIN "District"  d  ON d."DistrictID"   = u."DistrictID"
    LEFT JOIN "CaseStatusMaster" cs ON cs."CaseStatusID"     = cm."CaseStatusID"
    LEFT JOIN "GravityOffence"   go ON go."GravityOffenceID" = cm."GravityOffenceID"
    WHERE ${LIVE_PREDICATE}
    ORDER BY cm."CrimeRegisteredDate" ASC
    LIMIT ${FETCH_CAP}
  `;

  const [raw, summary, typeResolution] = await Promise.all([
    db.$queryRawUnsafe<CustodySqlRow[]>(sql),
    custodySummary(db, now),
    resolveTypes(db),
  ]);

  const all = raw.map((r) => toRow(r, now));
  // Same key as the desk: least time left on the statutory clock first, so a
  // custody filter hands back the rows in the order the desk already ranks in.
  all.sort((a, b) => a.clock.daysRemaining - b.clock.daysRemaining || a.caseId - b.caseId);

  const rows = filter === "all" ? all : all.filter((r) => matchesFilter(r, filter));
  return { rows: rows.slice(0, Math.max(1, limit)), summary, typeResolution, generatedAt: now.toISOString() };
}

export function matchesFilter(row: CustodyRow, filter: CustodyFilter): boolean {
  if (filter === "all") return true;
  if (filter === "none") return row.custody.broughtIn === 0;
  return row.custody.flags.includes(filter);
}

function toRow(r: CustodySqlRow, now: Date): CustodyRow {
  const daysSinceFir = r.date_registered ? daysSince(r.date_registered, now) : 0;
  const clock = chargesheetClock(daysSinceFir, r.gravity);
  return {
    caseId: Number(r.case_id),
    crimeNo: r.crime_no,
    crimeGroup: r.crime_group,
    station: r.station,
    district: r.district,
    status: r.status,
    dateRegistered: r.date_registered ? isoDate(r.date_registered) : null,
    daysSinceFir,
    chargesheeted: Boolean(r.chargesheeted),
    clock,
    custody: custodyPosition({
      accusedCount: Number(r.accused_count),
      broughtIn: Number(r.brought_in),
      actions: Number(r.actions),
      chargesheeted: Boolean(r.chargesheeted),
      lastActionDate: r.last_action,
      daysSinceFir,
      clockDaysRemaining: clock.daysRemaining,
      now,
    }),
  };
}

/**
 * Counted in SQL over every live case in scope, not over the fetched page — a
 * headline that silently describes one page while a filter is on is worse than
 * no headline. The thresholds are repeated here and must stay in step with
 * custodyPosition() above, which is what the rows themselves are scored with.
 */
async function custodySummary(db: Db, now: Date): Promise<CustodySummary> {
  const rows = await db.$queryRawUnsafe<
    { live_cases: number; none_brought_in: number; cs_no_custody: number; stale: number; accused_total: number; brought_in_total: number }[]
  >(`
    WITH live AS (
      SELECT
        (DATE_PART('day', $1::timestamptz - cm."CrimeRegisteredDate"))::int AS age,
        CASE WHEN LOWER(COALESCE(go."LookupValue", '')) IN ('non-heinous', 'non heinous')
             THEN ${CS_LIMIT_STANDARD_DAYS} ELSE ${CS_LIMIT_GRAVE_DAYS} END AS limit_days,
        ${CHARGESHEETED_EXPR} AS chargesheeted,
        (SELECT COUNT(*)::int FROM "Accused" ac WHERE ac."CaseMasterID" = cm."CaseMasterID") AS accused_count,
        LEAST(
          (SELECT COUNT(DISTINCT a."AccusedMasterID")::int FROM "ArrestSurrender" a
             WHERE a."CaseMasterID" = cm."CaseMasterID" AND a."AccusedMasterID" IS NOT NULL),
          (SELECT COUNT(*)::int FROM "Accused" ac WHERE ac."CaseMasterID" = cm."CaseMasterID")
        ) AS brought_in,
        (SELECT COUNT(*)::int FROM "ArrestSurrender" a WHERE a."CaseMasterID" = cm."CaseMasterID") AS actions,
        (SELECT MAX(a."ArrestSurrenderDate") FROM "ArrestSurrender" a WHERE a."CaseMasterID" = cm."CaseMasterID") AS last_action
      FROM "CaseMaster" cm
      LEFT JOIN "CaseStatusMaster" cs ON cs."CaseStatusID"     = cm."CaseStatusID"
      LEFT JOIN "GravityOffence"   go ON go."GravityOffenceID" = cm."GravityOffenceID"
      WHERE ${LIVE_PREDICATE}
    ), scored AS (
      SELECT *,
             COALESCE((DATE_PART('day', $1::timestamptz - last_action))::int, age) AS inaction_days,
             limit_days - GREATEST(age, 0) AS days_remaining
      FROM live
    )
    SELECT COUNT(*)::int                                                   AS live_cases,
           COUNT(*) FILTER (WHERE brought_in = 0)::int                     AS none_brought_in,
           COUNT(*) FILTER (WHERE chargesheeted AND actions = 0)::int       AS cs_no_custody,
           COUNT(*) FILTER (WHERE NOT chargesheeted
                              AND inaction_days >= ${STALE_ACTION_DAYS}
                              AND days_remaining <= ${CS_DUE_SOON_DAYS})::int AS stale,
           COALESCE(SUM(accused_count), 0)::int                            AS accused_total,
           COALESCE(SUM(brought_in), 0)::int                               AS brought_in_total
    FROM scored
  `, now);

  const r = rows[0];
  return {
    liveCases: Number(r?.live_cases ?? 0),
    noneBroughtIn: Number(r?.none_brought_in ?? 0),
    csNoCustody: Number(r?.cs_no_custody ?? 0),
    stale: Number(r?.stale ?? 0),
    accusedTotal: Number(r?.accused_total ?? 0),
    broughtInTotal: Number(r?.brought_in_total ?? 0),
  };
}

/**
 * Reports the distinct ArrestSurrenderTypeID values in scope. `resolved` is
 * always false: there is no ArrestSurrenderType lookup table in the schema, so
 * even a corpus carrying several ids could not be told which of them means
 * arrest and which means surrender. The measurement is still worth making — it
 * is what lets the screen say "brought in" and give the reason.
 */
async function resolveTypes(db: Db): Promise<CustodyTypeResolution> {
  const rows = await db.$queryRawUnsafe<{ type_id: number | null }[]>(
    `SELECT DISTINCT "ArrestSurrenderTypeID" AS type_id FROM "ArrestSurrender" ORDER BY 1`
  );
  const distinctTypeIds = rows.map((r) => r.type_id).filter((v): v is number => v != null).map(Number);
  return {
    resolved: false,
    distinctTypeIds,
    reason:
      "ArrestSurrenderTypeID has no lookup table in the schema, so no id can be mapped to arrest or surrender; " +
      `values present: ${distinctTypeIds.length ? distinctTypeIds.join(", ") : "none"}.`,
  };
}
