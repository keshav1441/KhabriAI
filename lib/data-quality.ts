import { prisma } from "./db";

/**
 * Reading the FIR data against itself.
 *
 * Every other surface in this app — the agent's SQL, the hotspot forecast, the
 * MO links, the alerts — is a claim about the case records. A claim is only
 * worth what the records underneath it are worth, and nobody in the chain gets
 * told when a column is empty: a map silently drops the FIRs with no
 * coordinates, similarity silently ranks the ones with no narrative last. This
 * module is the place those silences get counted out loud.
 *
 * Each check is one read-only SQL over the case tables. They are deliberately
 * separate queries rather than one wide scan: a reviewer reads them one at a
 * time, and a check that breaks should fail alone rather than take the console
 * with it.
 *
 * Every check named in the brief turned out to be supportable by the schema —
 * nothing had to be dropped. Two were sharpened against what the columns
 * actually allow, and those are noted at their definitions.
 */

export type Severity = "critical" | "warning" | "info";

/** What the check is measured against, so a percentage is readable. */
export type Denominator = "cases" | "arrests" | "stations";

export interface QualityCheck {
  key: string;
  title: string;
  /** Why a reviewer should care — the operational consequence, not the rule. */
  why: string;
  severity: Severity;
  denominator: Denominator;
  affected: number;
  total: number;
  pct: number;
  /** A handful of CrimeNos (or station names) so a reviewer can go look. */
  examples: string[];
}

export interface DistrictQuality {
  district: string;
  cases: number;
  /** FIRs failing at least one case-level check — a district's worst case. */
  defects: number;
  pct: number;
}

export interface DataQualityReport {
  generatedAt: string;
  totalCases: number;
  /** 0–100, weighted; see WEIGHTS below for how it is built. */
  score: number;
  /** Checks with a non-zero count, worst first, then the clean ones. */
  checks: QualityCheck[];
  failingChecks: number;
  districts: DistrictQuality[];
}

/**
 * The completeness score.
 *
 * Weighted mean of each check's pass rate, weighted by severity:
 *
 *   critical = 3   the record cannot do its job without it — no act/section,
 *                  no narrative, a chargesheet flag with nothing behind it, a
 *                  referential contradiction, an impossible date
 *   warning  = 2   the record works but a downstream feature quietly degrades —
 *                  no coordinates, no complainant, no victim, no accused
 *   info     = 1   a pattern worth a look rather than a defect in a row —
 *                  a station that has never filed a chargesheet
 *
 *   score = 100 × ( 1 − Σ(wᵢ · failRateᵢ) / Σwᵢ )
 *
 * Weighting by severity rather than by row count is the point: 20 FIRs with no
 * act/section matter more than 200 with no coordinates, and an unweighted mean
 * would say the opposite. The score is a headline, not a target — the ranked
 * list under it is what gets acted on.
 */
const WEIGHTS: Record<Severity, number> = { critical: 3, warning: 2, info: 1 };

/** A stable label for a case in the examples list; CrimeNo is nullable. */
const CASE_LABEL = `COALESCE(cm."CrimeNo", 'case #' || cm."CaseMasterID")`;

interface CheckDef {
  key: string;
  title: string;
  why: string;
  severity: Severity;
  denominator: Denominator;
  /** Must select a single text column `label`, one row per failing record. */
  failing: string;
}

// The case-level predicates live here as named fragments so the per-district
// breakdown can reuse the same definitions the checks are built from — a
// district's defect count and the check list must never be able to disagree.
const CHARGESHEETED = `EXISTS (
  SELECT 1 FROM "CaseStatusMaster" s
  WHERE s."CaseStatusID" = cm."CaseStatusID" AND s."CaseStatusName" ILIKE '%charge%'
)`;
const HAS_CS_ROW = `EXISTS (SELECT 1 FROM "ChargesheetDetails" c WHERE c."CaseMasterID" = cm."CaseMasterID")`;

/**
 * Case-level defect predicates, keyed by check. Anything in here counts toward
 * a district's defect rate; the arrest- and station-level checks do not,
 * because their denominator is not a case.
 */
const CASE_PREDICATES: Record<string, string> = {
  no_act_section: `NOT EXISTS (SELECT 1 FROM "ActSectionAssociation" a WHERE a."CaseMasterID" = cm."CaseMasterID")`,

  // "No accused details" is not the same as "no Accused row": the seed and the
  // real feed both produce rows whose AccusedName is null, which is a record of
  // nothing. Both shapes fail this check.
  no_accused: `NOT EXISTS (
    SELECT 1 FROM "Accused" a
    WHERE a."CaseMasterID" = cm."CaseMasterID" AND COALESCE(btrim(a."AccusedName"), '') <> ''
  )`,

  no_complainant: `NOT EXISTS (SELECT 1 FROM "ComplainantDetails" c WHERE c."CaseMasterID" = cm."CaseMasterID")`,

  no_victim: `NOT EXISTS (SELECT 1 FROM "Victim" v WHERE v."CaseMasterID" = cm."CaseMasterID")`,

  no_coordinates: `(cm.latitude IS NULL OR cm.longitude IS NULL)`,

  // Templated boilerplate counts as missing. scripts/enrich-briefs.ts finds the
  // un-rewritten seed rows with exactly this phrase ("Robbery reported at
  // station 66."), and a narrative like that carries no method, no place and no
  // sequence — it is a label, not facts, and similarity search cannot use it.
  no_narrative: `(
    cm."BriefFacts" IS NULL
    OR btrim(cm."BriefFacts") = ''
    OR cm."BriefFacts" ILIKE '%reported at station%'
  )`,

  chargesheeted_without_row: `${CHARGESHEETED} AND NOT ${HAS_CS_ROW}`,

  chargesheet_row_not_flagged: `${HAS_CS_ROW} AND NOT ${CHARGESHEETED}`,

  // A referential contradiction rather than a gap: the sub-head recorded on the
  // case belongs to a different major head than the one recorded beside it. One
  // of the two is wrong, and every group-by in the app trusts both.
  subhead_wrong_major_head: `EXISTS (
    SELECT 1 FROM "CrimeSubHead" sh
    WHERE sh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
      AND cm."CrimeMajorHeadID" IS NOT NULL
      AND sh."CrimeHeadID" <> cm."CrimeMajorHeadID"
  )`,

  future_registration: `cm."CrimeRegisteredDate" > CURRENT_DATE`,

  incident_after_registration: `(
    cm."IncidentFromDate" IS NOT NULL
    AND cm."CrimeRegisteredDate" IS NOT NULL
    AND cm."IncidentFromDate"::date > cm."CrimeRegisteredDate"
  )`,
};

const CHECKS: CheckDef[] = [
  {
    key: "no_act_section",
    title: "FIRs with no act or section recorded",
    why: "Without a section the FIR cannot be classified, prosecuted or counted in any offence-wise return — it is an entry, not a case.",
    severity: "critical",
    denominator: "cases",
    failing: `SELECT ${CASE_LABEL} AS label FROM "CaseMaster" cm WHERE ${CASE_PREDICATES.no_act_section}`,
  },
  {
    key: "no_narrative",
    title: "FIRs with no narrative, or only seed boilerplate",
    why: "Case similarity, MO linking and every citation the agent offers read the narrative; a one-line label leaves those cases invisible to all three.",
    severity: "critical",
    denominator: "cases",
    failing: `SELECT ${CASE_LABEL} AS label FROM "CaseMaster" cm WHERE ${CASE_PREDICATES.no_narrative}`,
  },
  {
    key: "chargesheeted_without_row",
    title: "Marked chargesheeted with no chargesheet record",
    why: "The disposal rate is computed from the status flag; a flag with no chargesheet behind it inflates it and nobody can produce the document.",
    severity: "critical",
    denominator: "cases",
    failing: `SELECT ${CASE_LABEL} AS label FROM "CaseMaster" cm WHERE ${CASE_PREDICATES.chargesheeted_without_row}`,
  },
  {
    key: "subhead_wrong_major_head",
    title: "Crime sub-head does not belong to its major head",
    why: "The two columns contradict each other, so the same case lands in one crime group by sub-head and another by major head depending on which the query used.",
    severity: "critical",
    denominator: "cases",
    failing: `SELECT ${CASE_LABEL} AS label FROM "CaseMaster" cm WHERE ${CASE_PREDICATES.subhead_wrong_major_head}`,
  },
  {
    key: "future_registration",
    title: "Registration dates in the future",
    why: "An impossible date; it drags month-wise counts and the hotspot forecast into periods that have not happened yet.",
    severity: "critical",
    denominator: "cases",
    failing: `SELECT ${CASE_LABEL} AS label FROM "CaseMaster" cm WHERE ${CASE_PREDICATES.future_registration}`,
  },
  {
    key: "arrest_without_accused",
    title: "Arrests with no accused linked",
    why: "An arrest that names nobody cannot be tied to a person's history, so repeat-offender and crew detection under-count exactly the people they exist to find.",
    severity: "critical",
    denominator: "arrests",
    // Three ways an arrest can fail to name someone: no link at all, a link to
    // an accused that no longer exists, or a link to an accused belonging to a
    // different case — the last is the one a nullable FK cannot prevent.
    failing: `SELECT COALESCE(cm."CrimeNo", 'case #' || ar."CaseMasterID") AS label
      FROM "ArrestSurrender" ar
      LEFT JOIN "Accused" a ON a."AccusedMasterID" = ar."AccusedMasterID"
      LEFT JOIN "CaseMaster" cm ON cm."CaseMasterID" = ar."CaseMasterID"
      WHERE ar."AccusedMasterID" IS NULL
         OR a."AccusedMasterID" IS NULL
         OR a."CaseMasterID" <> ar."CaseMasterID"`,
  },
  {
    key: "no_accused",
    title: "FIRs with no named accused",
    why: "Counts a case with an unnamed accused row the same as one with none — either way there is no person to link across cases or to an arrest.",
    severity: "warning",
    denominator: "cases",
    failing: `SELECT ${CASE_LABEL} AS label FROM "CaseMaster" cm WHERE ${CASE_PREDICATES.no_accused}`,
  },
  {
    key: "no_complainant",
    title: "FIRs with no complainant recorded",
    why: "The complainant is who the investigation reports back to; with no row there is no contact and no demographic breakdown of who is actually reporting crime.",
    severity: "warning",
    denominator: "cases",
    failing: `SELECT ${CASE_LABEL} AS label FROM "CaseMaster" cm WHERE ${CASE_PREDICATES.no_complainant}`,
  },
  {
    key: "no_victim",
    title: "FIRs with no victim recorded",
    why: "Victim age and gender drive every vulnerability read in the app; a case with no victim row is missing from all of them without saying so.",
    severity: "warning",
    denominator: "cases",
    failing: `SELECT ${CASE_LABEL} AS label FROM "CaseMaster" cm WHERE ${CASE_PREDICATES.no_victim}`,
  },
  {
    key: "no_coordinates",
    title: "FIRs missing coordinates",
    why: "The map and the hotspot forecast drop these rows silently, so a beat with poor geocoding reads as a beat with less crime.",
    severity: "warning",
    denominator: "cases",
    failing: `SELECT ${CASE_LABEL} AS label FROM "CaseMaster" cm WHERE ${CASE_PREDICATES.no_coordinates}`,
  },
  {
    key: "chargesheet_row_not_flagged",
    title: "Chargesheet filed but the case is not marked chargesheeted",
    why: "The converse error: real work already done that the disposal rate refuses to credit, and the case still shows in the pending pile.",
    severity: "warning",
    denominator: "cases",
    failing: `SELECT ${CASE_LABEL} AS label FROM "CaseMaster" cm WHERE ${CASE_PREDICATES.chargesheet_row_not_flagged}`,
  },
  {
    key: "incident_after_registration",
    title: "Incident date after the registration date",
    why: "The FIR was filed before the offence it describes; whichever date is wrong, any reporting-delay figure built from the pair is meaningless.",
    severity: "warning",
    denominator: "cases",
    failing: `SELECT ${CASE_LABEL} AS label FROM "CaseMaster" cm WHERE ${CASE_PREDICATES.incident_after_registration}`,
  },
  {
    key: "station_never_chargesheeted",
    title: "Stations that have filed cases but never a chargesheet",
    why: "Either the station is not filing chargesheets or it is not recording them — the first is a supervision problem, the second a data one, and both start here.",
    severity: "info",
    denominator: "stations",
    failing: `SELECT u."UnitName" AS label
      FROM "CaseMaster" cm
      JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
      GROUP BY u."UnitID", u."UnitName"
      HAVING COUNT(*) FILTER (
        WHERE EXISTS (SELECT 1 FROM "ChargesheetDetails" c WHERE c."CaseMasterID" = cm."CaseMasterID")
      ) = 0`,
  },
];

interface CheckRow {
  n: number;
  examples: string[] | null;
}

async function runCheck(def: CheckDef): Promise<Omit<QualityCheck, "total" | "pct">> {
  // The examples are ordered so a re-run shows a reviewer the same rows; an
  // arbitrary handful that changes between loads is not something to go look at.
  const rows = await prisma.$queryRawUnsafe<CheckRow[]>(
    `WITH bad AS (${def.failing})
     SELECT COUNT(*)::int AS n,
            (SELECT COALESCE(array_agg(label), ARRAY[]::text[])
               FROM (SELECT label FROM bad ORDER BY label LIMIT 6) s) AS examples
     FROM bad`
  );
  return {
    key: def.key,
    title: def.title,
    why: def.why,
    severity: def.severity,
    denominator: def.denominator,
    affected: Number(rows[0]?.n ?? 0),
    examples: rows[0]?.examples ?? [],
  };
}

/**
 * Where the problem sits. A case counts as defective if it fails any case-level
 * check — one FIR with four gaps is still one bad record, and a reviewer
 * choosing where to send a data-cleanup instruction thinks in records.
 */
async function districtBreakdown(): Promise<DistrictQuality[]> {
  const defect = Object.values(CASE_PREDICATES)
    .map((p) => `(${p})`)
    .join(" OR ");

  const rows = await prisma.$queryRawUnsafe<{ district: string; cases: number; defects: number }[]>(
    `SELECT COALESCE(d."DistrictName", 'Unassigned') AS district,
            COUNT(*)::int AS cases,
            COUNT(*) FILTER (WHERE ${defect})::int AS defects
     FROM "CaseMaster" cm
     LEFT JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
     LEFT JOIN "District" d ON d."DistrictID" = u."DistrictID"
     GROUP BY 1`
  );

  return rows
    .map((r) => ({
      district: r.district,
      cases: Number(r.cases),
      defects: Number(r.defects),
      pct: Number(r.cases) ? (Number(r.defects) / Number(r.cases)) * 100 : 0,
    }))
    .sort((a, b) => b.pct - a.pct || b.defects - a.defects);
}

export async function dataQualityReport(): Promise<DataQualityReport> {
  const [totals] = await prisma.$queryRawUnsafe<{ cases: number; arrests: number; stations: number }[]>(
    `SELECT (SELECT COUNT(*)::int FROM "CaseMaster") AS cases,
            (SELECT COUNT(*)::int FROM "ArrestSurrender") AS arrests,
            (SELECT COUNT(DISTINCT "PoliceStationID")::int FROM "CaseMaster" WHERE "PoliceStationID" IS NOT NULL) AS stations`
  );
  const denominators: Record<Denominator, number> = {
    cases: Number(totals?.cases ?? 0),
    arrests: Number(totals?.arrests ?? 0),
    stations: Number(totals?.stations ?? 0),
  };

  const [results, districts] = await Promise.all([
    Promise.all(CHECKS.map(runCheck)),
    districtBreakdown(),
  ]);

  const checks: QualityCheck[] = results.map((r) => {
    const total = denominators[r.denominator];
    return { ...r, total, pct: total ? (r.affected / total) * 100 : 0 };
  });

  // Worst first: severity decides the tier, the failure rate orders inside it.
  // A clean check sinks regardless of how severe it would have been.
  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  checks.sort((a, b) => {
    if (!a.affected !== !b.affected) return a.affected ? -1 : 1;
    return rank[a.severity] - rank[b.severity] || b.pct - a.pct;
  });

  const failingChecks = checks.filter((c) => c.affected > 0).length;
  const weight = checks.reduce((s, c) => s + WEIGHTS[c.severity], 0);
  const penalty = checks.reduce((s, c) => s + (WEIGHTS[c.severity] * c.pct) / 100, 0);
  const raw = weight ? 100 * (1 - penalty / weight) : 100;
  // A handful of bad records out of 20k rounds to a clean 100, which would be a
  // lie the moment a reviewer scrolled down and saw a failing check. 100 is
  // reserved for a report with nothing failing at all.
  const score = failingChecks ? Math.min(99.9, Math.floor(raw * 10) / 10) : 100;

  return {
    generatedAt: new Date().toISOString(),
    totalCases: denominators.cases,
    score,
    checks,
    failingChecks,
    districts,
  };
}
