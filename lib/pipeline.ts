import type { Db } from "./db";

/**
 * The throughput of justice — FIR → arrest → chargesheet → court.
 *
 * Every crime dashboard on this screen already answers "how much crime".
 * None of them answer "how fast does a case actually move", which is the
 * question a DGP asks when a district's numbers look fine and its trials do
 * not. This measures, per stage: how many cases reach it, how long they take to
 * get there from the FIR, and how many never arrive at all.
 *
 * What the schema DOES support:
 *   - registered   CaseMaster.CrimeRegisteredDate  (@db.Date)
 *   - arrested     ArrestSurrender.ArrestSurrenderDate (@db.Date), earliest per case
 *   - chargesheet  ChargesheetDetails.csdate (DateTime), earliest per case
 *
 * What it does NOT support — the court stage:
 *   CaseMaster.CourtID exists, but it is a JURISDICTION, not a milestone: every
 *   one of the 20,001 cases in this corpus carries one, including the 1,909
 *   marked False Case. Court has CourtName/DistrictID/StateID and no date
 *   column; there is no committal date, no first-hearing date, no disposal date
 *   anywhere in the schema (lib/pendency.ts hit the same wall and left
 *   nextHearingDate as a hard `null` for the same reason). So the court stage is
 *   carried through as a DECLARED, UNMEASURED stage: named, with the reason
 *   attached, and with no count and no duration invented for it. A proxy built
 *   from CourtID would report 100% reach and zero days, which is worse than an
 *   honest blank.
 *
 * Two more deliberate honesty rules, both enforced in the pure functions below:
 *   - MEDIAN, never mean. A handful of 2024 cases still without a chargesheet
 *     would otherwise define the "average" for every district.
 *   - NEGATIVE durations are excluded, not clamped to zero. 671 cases in this
 *     corpus carry a chargesheet dated before their own arrest — data entry, not
 *     time travel. Clamping them to 0 would drag the median down and make a slow
 *     district look fast; they are counted and reported separately instead.
 *
 * The arithmetic is pure and database-free (see test/pipeline.test.ts); only
 * fetchTimelines/computePipeline touch the caller's scoped Db.
 */

// ---- Stages ----------------------------------------------------------------

export type StageId = "registered" | "arrested" | "chargesheet" | "court";

/** i18n keys already defined in lib/i18n.ts — the module names them, the view renders them. */
export const STAGE_LABEL_KEY: Record<StageId, string> = {
  registered: "pipeline.registered",
  arrested: "pipeline.arrested",
  chargesheet: "pipeline.chargesheet",
  court: "pipeline.court",
};

/** One case's milestone dates. Anything the schema cannot date arrives as null. */
export interface CaseTimeline {
  caseId: number;
  district: string;
  crimeGroup: string;
  /** Cases with no FIR date are dropped before they get here — no day zero, no clock. */
  firDate: string;
  arrestDate: string | null;
  chargesheetDate: string | null;
}

export interface PipelineStage {
  id: StageId;
  labelKey: string;
  /** Cases that reached this stage. null when the stage cannot be measured at all. */
  reached: number | null;
  /** Cases in scope that never reached it. Includes cases still too young to have — see `method`. */
  dropOff: number | null;
  dropOffPct: number | null;
  /** Days from the FIR to this stage, over the cases that reached it. */
  medianDaysFromFir: number | null;
  p90DaysFromFir: number | null;
  /** The step INTO this stage, from the previous measurable one. */
  fromStage: StageId | null;
  medianTransitionDays: number | null;
  p90TransitionDays: number | null;
  /** Durations thrown out as negative (milestone dated before the one before it). */
  excludedNegative: number;
  measured: boolean;
  /** Present only when measured is false — why the schema cannot answer. */
  note?: string;
}

export interface Bottleneck {
  stage: StageId;
  fromStage: StageId;
  labelKey: string;
  medianDays: number;
  reached: number;
}

export interface PipelineBreakdown {
  key: string;
  total: number;
  reachedArrest: number;
  reachedChargesheet: number;
  medianToArrest: number | null;
  medianToChargesheet: number | null;
  /** Share of cases with no chargesheet, 0..100 — the column a district is ranked on. */
  chargesheetDropOffPct: number;
}

export interface Pipeline {
  totalCases: number;
  windowMonths: number;
  stages: PipelineStage[];
  bottleneck: Bottleneck | null;
  byDistrict: PipelineBreakdown[];
  byCrimeGroup: PipelineBreakdown[];
  /** The longest-running cases at the bottleneck step, newest-slowest first. */
  slowest: SlowCase[];
  method: string;
  generatedAt: string;
}

// ---- Pure arithmetic -------------------------------------------------------

/** Whole days between two calendar dates, UTC — @db.Date values land on UTC midnight. */
export function daysBetween(from: string | Date, to: string | Date): number {
  const a = typeof from === "string" ? new Date(from) : from;
  const b = typeof to === "string" ? new Date(to) : to;
  const ua = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const ub = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.floor((ub - ua) / 86_400_000);
}

/**
 * Median of a sample. Even counts average the two middle values; an empty
 * sample is null, not 0 — "no cases reached this stage" and "they took no time"
 * are different statements and the UI must be able to tell them apart.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Nearest-rank percentile (p in 0..1), on the same empty-is-null contract as median. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * s.length);
  return s[Math.min(s.length - 1, Math.max(0, rank - 1))];
}

export interface DurationSample {
  /** Usable durations, in days. */
  days: number[];
  /** Cases that reached the stage — days.length plus the excluded ones. */
  reached: number;
  /** Reached the stage but dated before the milestone it is measured from. */
  excludedNegative: number;
  /** Never reached the stage in this window. */
  notReached: number;
}

/**
 * Split a set of (from, to) date pairs into what can be measured and what
 * cannot. A missing `to` is a DROP-OFF, never a zero-day transition — that is
 * the difference between "this case never got a chargesheet" and "it got one
 * the same day", and collapsing them is how a funnel starts lying.
 */
export function sampleDurations(pairs: { from: string | null; to: string | null }[]): DurationSample {
  const days: number[] = [];
  let excludedNegative = 0;
  let notReached = 0;
  let reached = 0;

  for (const { from, to } of pairs) {
    if (!to) { notReached++; continue; }
    reached++;
    // No `from` means the step before it is itself unmeasured for this case: the
    // case counts as having reached the stage, but contributes no duration.
    if (!from) continue;
    const d = daysBetween(from, to);
    if (d < 0) { excludedNegative++; continue; }
    days.push(d);
  }
  return { days, reached, excludedNegative, notReached };
}

/**
 * The funnel. `registered` is day zero by definition — every row in `rows`
 * already has an FIR date, so it is 100% reach and no duration.
 */
export function buildStages(rows: CaseTimeline[]): PipelineStage[] {
  const total = rows.length;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10);

  const arrest = sampleDurations(rows.map((r) => ({ from: r.firDate, to: r.arrestDate })));
  const csFromFir = sampleDurations(rows.map((r) => ({ from: r.firDate, to: r.chargesheetDate })));
  // Measured from the arrest, so it is the step itself and not the whole run
  // from the FIR. Cases charge-sheeted without any arrest on record contribute a
  // reach but no duration (from === null above).
  const csFromArrest = sampleDurations(rows.map((r) => ({ from: r.arrestDate, to: r.chargesheetDate })));

  return [
    {
      id: "registered",
      labelKey: STAGE_LABEL_KEY.registered,
      reached: total,
      dropOff: 0,
      dropOffPct: 0,
      medianDaysFromFir: 0,
      p90DaysFromFir: 0,
      fromStage: null,
      medianTransitionDays: null,
      p90TransitionDays: null,
      excludedNegative: 0,
      measured: true,
    },
    {
      id: "arrested",
      labelKey: STAGE_LABEL_KEY.arrested,
      reached: arrest.reached,
      dropOff: arrest.notReached,
      dropOffPct: pct(arrest.notReached),
      medianDaysFromFir: median(arrest.days),
      p90DaysFromFir: percentile(arrest.days, 0.9),
      fromStage: "registered",
      medianTransitionDays: median(arrest.days),
      p90TransitionDays: percentile(arrest.days, 0.9),
      excludedNegative: arrest.excludedNegative,
      measured: true,
    },
    {
      id: "chargesheet",
      labelKey: STAGE_LABEL_KEY.chargesheet,
      reached: csFromFir.reached,
      dropOff: csFromFir.notReached,
      dropOffPct: pct(csFromFir.notReached),
      medianDaysFromFir: median(csFromFir.days),
      p90DaysFromFir: percentile(csFromFir.days, 0.9),
      fromStage: "arrested",
      medianTransitionDays: median(csFromArrest.days),
      p90TransitionDays: percentile(csFromArrest.days, 0.9),
      excludedNegative: csFromArrest.excludedNegative,
      measured: true,
    },
    {
      id: "court",
      labelKey: STAGE_LABEL_KEY.court,
      reached: null,
      dropOff: null,
      dropOffPct: null,
      medianDaysFromFir: null,
      p90DaysFromFir: null,
      fromStage: "chargesheet",
      medianTransitionDays: null,
      p90TransitionDays: null,
      excludedNegative: 0,
      measured: false,
      note:
        "Not measurable from this schema. CaseMaster.CourtID is the court with jurisdiction, " +
        "set on every case including False Case ones, and Court carries no date column — there is " +
        "no committal, hearing or disposal date to measure against. Shown so the missing step is " +
        "visible rather than silently dropped.",
    },
  ];
}

/**
 * The slowest step: the largest median TRANSITION, not the largest median from
 * the FIR. Days-from-FIR grow monotonically down the funnel, so ranking on that
 * would always name the last stage and never tell anyone anything.
 */
export function pickBottleneck(stages: PipelineStage[]): Bottleneck | null {
  let best: Bottleneck | null = null;
  for (const s of stages) {
    if (!s.measured || s.fromStage === null || s.medianTransitionDays === null) continue;
    if (best === null || s.medianTransitionDays > best.medianDays) {
      best = {
        stage: s.id,
        fromStage: s.fromStage,
        labelKey: s.labelKey,
        medianDays: s.medianTransitionDays,
        reached: s.reached ?? 0,
      };
    }
  }
  return best;
}

export interface SlowCase {
  caseId: number;
  district: string;
  crimeGroup: string;
  firDate: string;
  days: number;
}

/**
 * The individual cases that sat longest on one step. A funnel says the step is
 * slow; this says which files to pull, which is the only version of the finding
 * an officer can act on — the view opens them in the existing CaseDrawer.
 */
export function slowestForStage(rows: CaseTimeline[], stage: StageId, limit = 10): SlowCase[] {
  const span = (r: CaseTimeline): { from: string | null; to: string | null } =>
    stage === "arrested" ? { from: r.firDate, to: r.arrestDate }
    : stage === "chargesheet" ? { from: r.arrestDate, to: r.chargesheetDate }
    : { from: null, to: null };

  return rows
    .map((r) => {
      const { from, to } = span(r);
      if (!from || !to) return null;
      const days = daysBetween(from, to);
      // Same exclusion as the medians — a negative row is bad data, not a slow case.
      if (days < 0) return null;
      return { caseId: r.caseId, district: r.district, crimeGroup: r.crimeGroup, firDate: r.firDate, days };
    })
    .filter((c): c is SlowCase => c !== null)
    .sort((a, b) => b.days - a.days || a.caseId - b.caseId)
    .slice(0, limit);
}

/** One breakdown row per district / crime group, over the same rules as the funnel. */
export function buildBreakdown(rows: CaseTimeline[], keyOf: (r: CaseTimeline) => string): PipelineBreakdown[] {
  const groups = new Map<string, CaseTimeline[]>();
  for (const r of rows) {
    const k = keyOf(r) || "Unknown";
    const g = groups.get(k);
    if (g) g.push(r); else groups.set(k, [r]);
  }

  return [...groups.entries()]
    .map(([key, g]) => {
      const arrest = sampleDurations(g.map((r) => ({ from: r.firDate, to: r.arrestDate })));
      const cs = sampleDurations(g.map((r) => ({ from: r.firDate, to: r.chargesheetDate })));
      return {
        key,
        total: g.length,
        reachedArrest: arrest.reached,
        reachedChargesheet: cs.reached,
        medianToArrest: median(arrest.days),
        medianToChargesheet: median(cs.days),
        chargesheetDropOffPct: g.length === 0 ? 0 : Math.round((cs.notReached / g.length) * 1000) / 10,
      };
    })
    // Worst chargesheet drop-off first: the table exists to name where cases
    // stop, and a tie goes to the district carrying more of them.
    .sort((a, b) => b.chargesheetDropOffPct - a.chargesheetDropOffPct || b.total - a.total);
}

// ---- The database read -----------------------------------------------------

export interface PipelineOptions {
  /** Months of FIRs to include, counted back from `now`. */
  windowMonths?: number;
  district?: string | null;
  crimeGroup?: string | null;
  now?: Date;
}

// The whole corpus is ~20k cases and one row is five small columns, so the
// funnel is computed in TypeScript rather than split between SQL percentiles and
// TS ones — one implementation of the median means the breakdown table can never
// disagree with the funnel above it. The cap is a guard, not a page size.
const FETCH_CAP = 50_000;
const DEFAULT_WINDOW_MONTHS = 24;

type TimelineSqlRow = {
  case_id: number;
  district: string | null;
  crime_group: string | null;
  fir_date: Date;
  arrest_date: Date | null;
  cs_date: Date | null;
};

const iso = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

/**
 * Milestone dates for every case in scope. Earliest arrest and earliest
 * chargesheet per case: a case with three accused arrested on three days
 * reached the arrest stage on the first of them.
 */
export async function fetchTimelines(db: Db, opts: PipelineOptions = {}): Promise<CaseTimeline[]> {
  const now = opts.now ?? new Date();
  const windowMonths = Math.min(Math.max(opts.windowMonths ?? DEFAULT_WINDOW_MONTHS, 1), 120);
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - windowMonths, now.getUTCDate()));

  const rows = await db.$queryRawUnsafe<TimelineSqlRow[]>(
    `
    SELECT
      cm."CaseMasterID"      AS case_id,
      d."DistrictName"       AS district,
      ch."CrimeGroupName"    AS crime_group,
      cm."CrimeRegisteredDate" AS fir_date,
      (SELECT MIN(a."ArrestSurrenderDate") FROM "ArrestSurrender"    a WHERE a."CaseMasterID" = cm."CaseMasterID") AS arrest_date,
      (SELECT MIN(c."csdate")              FROM "ChargesheetDetails" c WHERE c."CaseMasterID" = cm."CaseMasterID") AS cs_date
    FROM "CaseMaster" cm
    LEFT JOIN "Unit"      u  ON u."UnitID"     = cm."PoliceStationID"
    LEFT JOIN "District"  d  ON d."DistrictID" = u."DistrictID"
    LEFT JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
    WHERE cm."CrimeRegisteredDate" IS NOT NULL
      AND cm."CrimeRegisteredDate" >= $1::date
      AND cm."CrimeRegisteredDate" <= $2::date
      AND ($3::text IS NULL OR d."DistrictName"    = $3::text)
      AND ($4::text IS NULL OR ch."CrimeGroupName" = $4::text)
    ORDER BY cm."CrimeRegisteredDate" DESC
    LIMIT ${FETCH_CAP}
  `,
    from,
    now,
    opts.district ?? null,
    opts.crimeGroup ?? null
  );

  return rows.map((r) => ({
    caseId: Number(r.case_id),
    district: r.district ?? "Unknown",
    crimeGroup: r.crime_group ?? "Unknown",
    firDate: iso(r.fir_date),
    arrestDate: r.arrest_date ? iso(r.arrest_date) : null,
    chargesheetDate: r.cs_date ? iso(r.cs_date) : null,
  }));
}

export async function computePipeline(db: Db, opts: PipelineOptions = {}): Promise<Pipeline> {
  const now = opts.now ?? new Date();
  const windowMonths = Math.min(Math.max(opts.windowMonths ?? DEFAULT_WINDOW_MONTHS, 1), 120);
  const rows = await fetchTimelines(db, { ...opts, now, windowMonths });

  const stages = buildStages(rows);
  const bottleneck = pickBottleneck(stages);
  const negatives = stages.reduce((a, s) => a + s.excludedNegative, 0);

  return {
    totalCases: rows.length,
    windowMonths,
    stages,
    bottleneck,
    byDistrict: buildBreakdown(rows, (r) => r.district),
    byCrimeGroup: buildBreakdown(rows, (r) => r.crimeGroup),
    slowest: bottleneck ? slowestForStage(rows, bottleneck.stage) : [],
    method:
      `FIRs registered in the last ${windowMonths} months. Arrest = earliest ArrestSurrenderDate on the case; ` +
      `chargesheet = earliest ChargesheetDetails.csdate. Durations are medians and p90s, never means. ` +
      `${negatives} duration${negatives === 1 ? " was" : "s were"} excluded as negative (a milestone dated before the one it follows). ` +
      `Drop-off counts cases that have not reached the stage YET as well as those that never will — a case registered last week ` +
      `is not a failure, and the schema carries no expected-completion date to separate them. ` +
      `The court stage is named but not measured: CaseMaster.CourtID is a jurisdiction set on every case and Court has no date column.`,
    generatedAt: now.toISOString(),
  };
}
