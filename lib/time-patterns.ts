import type { Db } from "./db";

/**
 * "When crime happens" — the hour-of-day, day-of-week and month-of-year shape
 * of the caseload.
 *
 * The hotspot map answers WHERE a shift should stand. This answers WHEN, which
 * is the other half of the same order. Everything here is a count of cases in a
 * time bucket; nothing is projected.
 *
 * What the schema actually supports, checked against the live corpus rather
 * than assumed:
 *   - `CrimeRegisteredDate` is `@db.Date` — a bare date. It has NO time of day.
 *     Every hour-of-day figure drawn from it would be midnight.
 *   - `IncidentFromDate` is a full timestamp and does carry all 24 hours, so it
 *     is the only column an hour-of-day panel can honestly be built on. It is
 *     also the right column in principle: it is the offence time, not the
 *     paperwork time.
 *   - In this corpus `IncidentFromDate` sits within a day of the registration
 *     date (mean gap ~0h), so it inherits the registration date's shape. That
 *     is the caveat the UI prints: these are FIR-adjacent timestamps, not
 *     independently observed offence times.
 *
 * The honesty rule this module enforces: a bucket being the tallest does not
 * make it a pattern. Counts wobble. `detectPeak` first asks whether the whole
 * distribution departs from uniform by more than sampling noise (Pearson
 * chi-square goodness-of-fit, p < 0.05) and only then names a window. When the
 * answer is no, the verdict is "flat" and the UI says so instead of pointing at
 * an accidental maximum.
 */

// ---- Bucketing (pure) ------------------------------------------------------

/** Day-of-week buckets are Monday-first (ISO order): a shift roster reads Mon…Sun, not Sun…Sat. */
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export const HOUR_BUCKETS = 24;
export const WEEKDAY_BUCKETS = 7;
export const MONTH_BUCKETS = 12;

/** JS getDay() is Sunday-first; shift it so Monday is 0 and Sunday is 6. */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function emptyCounts(n: number): number[] {
  return Array(n).fill(0);
}

/**
 * Counts per bucket for a list of instants. Dates are read in the runtime's
 * local zone, matching the way Postgres reads these `timestamp without time
 * zone` columns — no zone is stored, so no zone is applied.
 */
export function bucketByHour(dates: Date[]): number[] {
  const out = emptyCounts(HOUR_BUCKETS);
  for (const d of dates) out[d.getHours()]++;
  return out;
}

export function bucketByWeekday(dates: Date[]): number[] {
  const out = emptyCounts(WEEKDAY_BUCKETS);
  for (const d of dates) out[weekdayIndex(d)]++;
  return out;
}

export function bucketByMonth(dates: Date[]): number[] {
  const out = emptyCounts(MONTH_BUCKETS);
  for (const d of dates) out[d.getMonth()]++;
  return out;
}

/** The day × hour grid, as 7 rows of 24. Both axes come from the same instant. */
export function bucketByWeekdayHour(dates: Date[]): number[][] {
  const grid = Array.from({ length: WEEKDAY_BUCKETS }, () => emptyCounts(HOUR_BUCKETS));
  for (const d of dates) grid[weekdayIndex(d)][d.getHours()]++;
  return grid;
}

/** One pre-grouped (weekday, hour, month) cell as it comes back from SQL. */
export interface BucketRow {
  dow: number;
  hour: number;
  month: number;
  n: number;
}

export interface ShapedBuckets {
  total: number;
  hour: number[];
  weekday: number[];
  month: number[];
  grid: number[][];
}

/**
 * Fold pre-grouped cells into the three marginals and the day × hour grid.
 * Kept separate from the query so the shaping can be tested without a database,
 * and so the grid and the marginals are provably built from the same rows —
 * a panel that disagreed with the grid would be worse than no panel.
 * Out-of-range indices are dropped rather than clamped: a bad bucket should
 * vanish, not silently inflate Monday.
 */
export function shapeBuckets(rows: BucketRow[]): ShapedBuckets {
  const grid = Array.from({ length: WEEKDAY_BUCKETS }, () => emptyCounts(HOUR_BUCKETS));
  const hour = emptyCounts(HOUR_BUCKETS);
  const weekday = emptyCounts(WEEKDAY_BUCKETS);
  const month = emptyCounts(MONTH_BUCKETS);
  let total = 0;

  for (const r of rows) {
    const n = Number(r.n);
    if (!Number.isFinite(n) || n <= 0) continue;
    const d = Number(r.dow), h = Number(r.hour), m = Number(r.month);
    const okD = Number.isInteger(d) && d >= 0 && d < WEEKDAY_BUCKETS;
    const okH = Number.isInteger(h) && h >= 0 && h < HOUR_BUCKETS;
    const okM = Number.isInteger(m) && m >= 0 && m < MONTH_BUCKETS;
    total += n;
    if (okD) weekday[d] += n;
    if (okH) hour[h] += n;
    if (okM) month[m] += n;
    if (okD && okH) grid[d][h] += n;
  }

  return { total, hour, weekday, month, grid };
}

// ---- Is it a pattern, or is it noise? --------------------------------------

/** Abramowitz & Stegun 7.1.26 — enough precision to separate p=0.04 from p=0.06. */
function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

/** P(Z > z) for a standard normal. */
function normalUpperTail(z: number): number {
  return 0.5 * (1 - erf(z / Math.SQRT2));
}

/**
 * Upper-tail p-value for a chi-square statistic, via the Wilson–Hilferty cube-root
 * transform to a normal. Accurate to ~1e-3 in the region we actually decide on,
 * and it keeps this module dependency-free.
 */
export function chiSquarePValue(chi2: number, df: number): number {
  if (df <= 0) return 1;
  if (chi2 <= 0) return 1;
  const t = 2 / (9 * df);
  const z = (Math.cbrt(chi2 / df) - (1 - t)) / Math.sqrt(t);
  return Math.min(1, Math.max(0, normalUpperTail(z)));
}

/**
 * Pearson goodness-of-fit against a stated expectation.
 *
 * `weights` is how much of the window each bucket was actually exposed to — the
 * number of Tuesdays in the range, the number of days that fell in March. A flat
 * expectation is only correct when exposure is equal, which it is for hours and
 * is NOT for months: over a 90-day window nine months have no coverage at all,
 * and testing them against 1/12 each would "discover" a seasonal pattern that is
 * really just the calendar. Buckets with zero exposure are excluded outright
 * rather than counted as a shortfall.
 */
export function goodnessOfFit(counts: number[], weights?: number[]): {
  chi2: number; df: number; p: number; expected: number[]; active: number[];
} {
  const n = counts.length;
  const w = weights?.length === n ? weights : Array(n).fill(1);
  const active = w.map((x, i) => (x > 0 ? i : -1)).filter((i) => i >= 0);
  const totalW = active.reduce((a, i) => a + w[i], 0);
  const total = counts.reduce((a, b) => a + b, 0);
  const expected = w.map((x) => (totalW > 0 && x > 0 ? (total * x) / totalW : 0));

  if (!total || !active.length) return { chi2: 0, df: Math.max(0, active.length - 1), p: 1, expected, active };
  const chi2 = active.reduce((a, i) => a + (counts[i] - expected[i]) ** 2 / expected[i], 0);
  const df = active.length - 1;
  return { chi2, df, p: chiSquarePValue(chi2, df), expected, active };
}

/** Pearson goodness-of-fit against a flat expectation across the buckets. */
export function uniformChiSquare(counts: number[]): { chi2: number; df: number; p: number; expected: number } {
  const g = goodnessOfFit(counts);
  return { chi2: g.chi2, df: g.df, p: g.p, expected: g.expected[0] ?? 0 };
}

/**
 * How much of the window each weekday and each calendar month was actually
 * exposed to, counted in days over the inclusive range. This is what turns
 * "March is busiest" from a statement about the calendar into a statement about
 * crime. Hours need no correction — every covered day contains all 24.
 */
export function coverageWeights(from: Date, to: Date): { hour: number[]; weekday: number[]; month: number[] } {
  const hour = Array(HOUR_BUCKETS).fill(1);
  const weekday = emptyCounts(WEEKDAY_BUCKETS);
  const month = emptyCounts(MONTH_BUCKETS);
  if (!(from instanceof Date) || !(to instanceof Date) || isNaN(+from) || isNaN(+to) || from > to) {
    return { hour, weekday: Array(WEEKDAY_BUCKETS).fill(1), month: Array(MONTH_BUCKETS).fill(1) };
  }
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  // Day-by-day: at most ~730 iterations, and it gets leap years and short
  // months right without any arithmetic worth arguing about.
  for (; d <= end; d.setDate(d.getDate() + 1)) {
    weekday[weekdayIndex(d)]++;
    month[d.getMonth()]++;
  }
  return { hour, weekday, month };
}

export const SIGNIFICANCE = 0.05;
/** Pearson's test needs a decent expected count per cell before its p-value means anything. */
export const MIN_EXPECTED_PER_BUCKET = 5;

export type PeakVerdict = "peak" | "flat" | "insufficient";

export interface Peak {
  verdict: PeakVerdict;
  /** Bucket indices in the window, in order. Circular, so a window may wrap (…22, 23, 0). */
  window: number[];
  /** Cases inside the window. */
  observed: number;
  /** Cases the coverage-corrected baseline would have put there. */
  expected: number;
  /** observed / expected. 1.0 means exactly baseline. */
  lift: number;
  chi2: number;
  df: number;
  p: number;
  total: number;
}

/**
 * The busiest window, but only when the distribution as a whole is distinguishable
 * from its baseline. Three gates, in order:
 *
 *   1. Any data at all.
 *   2. Enough of it for the test to mean anything — every tested bucket expecting
 *      at least 5 cases, the usual validity condition for Pearson's test. Below
 *      that the answer is "insufficient", not "flat": absence of evidence.
 *   3. Chi-square against the (coverage-weighted) baseline at p < 0.05. Fail it
 *      and the verdict is "flat" — the tallest bar is where sampling put it, and
 *      calling that a pattern would be inventing a shift plan out of noise.
 *
 * Only past all three is a window named: the contiguous (circular) run of `width`
 * buckets with the highest observed-to-expected ratio. Ranking on the ratio
 * rather than the raw count matters once exposure is uneven — otherwise a month
 * simply present for more days would always win.
 */
export function detectPeak(counts: number[], width = 1, weights?: number[]): Peak {
  const n = counts.length;
  const total = counts.reduce((a, b) => a + b, 0);
  const { chi2, df, p, expected, active } = goodnessOfFit(counts, weights);
  const w = Math.max(1, Math.min(width, n));
  const usable = new Set(active);

  const base: Peak = { verdict: "flat", window: [], observed: 0, expected: 0, lift: 0, chi2, df, p, total };
  if (!n || total === 0 || !active.length) return { ...base, verdict: "insufficient", p: 1, chi2: 0 };
  if (Math.min(...active.map((i) => expected[i])) < MIN_EXPECTED_PER_BUCKET) return { ...base, verdict: "insufficient" };
  if (p >= SIGNIFICANCE) return base;

  let best: { start: number; obs: number; exp: number } | null = null;
  for (let s = 0; s < n; s++) {
    const idx = Array.from({ length: w }, (_, k) => (s + k) % n);
    // A window containing an unexposed bucket is not a window we can rate.
    if (!idx.every((i) => usable.has(i))) continue;
    const obs = idx.reduce((a, i) => a + counts[i], 0);
    const exp = idx.reduce((a, i) => a + expected[i], 0);
    if (!best || obs / exp > best.obs / best.exp) best = { start: s, obs, exp };
  }
  if (!best) return base;

  return {
    verdict: "peak",
    window: Array.from({ length: w }, (_, k) => (best!.start + k) % n),
    observed: best.obs,
    expected: best.exp,
    lift: best.exp ? best.obs / best.exp : 0,
    chi2, df, p, total,
  };
}

/** "22:00–02:00" for hours, "Fri–Sun" for weekdays. Handles the wrap. */
export function describeHourWindow(window: number[]): string {
  if (!window.length) return "";
  const start = window[0];
  const end = (window[window.length - 1] + 1) % HOUR_BUCKETS;
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return `${hh(start)}–${hh(end)}`;
}

export function describeWeekdayWindow(window: number[]): string {
  if (!window.length) return "";
  if (window.length === 1) return WEEKDAYS[window[0]];
  return `${WEEKDAYS[window[0]]}–${WEEKDAYS[window[window.length - 1]]}`;
}

// ---- The database side -----------------------------------------------------

export interface PatternFilters {
  crimeGroup?: string | null;
  districtId?: number | null;
  /** Look-back in days; null means the whole corpus. */
  days?: number | null;
}

export interface PatternAxis {
  labels: string[];
  counts: number[];
  peak: Peak;
  /** Rendered window ("22:00–02:00"), empty when the verdict is not "peak". */
  peakLabel: string;
}

export interface TimePatterns {
  total: number;
  /** Whether an hour-of-day panel can be drawn at all, and why not when it cannot. */
  hourSupported: boolean;
  hourSource: string;
  hour: PatternAxis;
  weekday: PatternAxis;
  month: PatternAxis;
  /** 7 rows (Mon…Sun) × 24 columns. Empty when hours are unsupported. */
  grid: number[][];
  crimeGroups: string[];
  method: string;
  generatedAt: string;
  filters: { crimeGroup: string | null; districtId: number | null; days: number | null };
}

/**
 * Hour of day exists only because `IncidentFromDate` is a timestamp.
 * `CrimeRegisteredDate` is a DATE column — no clock — so every axis here is read
 * off the incident timestamp instead, which keeps the day × hour grid coherent
 * (both of its axes come from the same instant).
 */
const TIME_COLUMN = `cm."IncidentFromDate"`;

const HOUR_WINDOW = 4;   // a patrol shift block, not a single hour
const WEEKDAY_WINDOW = 2; // a weekend-shaped run, not one day

function axis(
  labels: string[], counts: number[], width: number,
  describe: (w: number[]) => string, weights?: number[],
): PatternAxis {
  const peak = detectPeak(counts, width, weights);
  return { labels, counts, peak, peakLabel: peak.verdict === "peak" ? describe(peak.window) : "" };
}

/**
 * One round trip. Grouping by (weekday, hour, month) is at most 7×24×12 groups,
 * which is cheaper than three scans and gives the heat grid and all three
 * marginals from the same rows — so the panels can never disagree with the grid.
 *
 * `db` is the caller's scoped client: an SHO's RLS transaction cuts the rows
 * before they are ever counted, so no district filter here can be forgotten.
 */
export async function computeTimePatterns(db: Db, filters: PatternFilters = {}): Promise<TimePatterns> {
  const crimeGroup = filters.crimeGroup?.trim() || null;
  const districtId = Number.isFinite(filters.districtId) ? Number(filters.districtId) : null;
  const days = Number.isFinite(filters.days) && Number(filters.days) > 0 ? Math.floor(Number(filters.days)) : null;

  // The range the counts actually cover, so months and weekdays can be tested
  // against the exposure they had rather than against a flat twelfth of a year.
  const spanRows = await db.$queryRawUnsafe<{ lo: Date | null; hi: Date | null }[]>(
    `SELECT MIN(${TIME_COLUMN}) AS lo, MAX(${TIME_COLUMN}) AS hi
     FROM "CaseMaster" cm
     JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
     JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
     WHERE ${TIME_COLUMN} IS NOT NULL
       AND ($1::text IS NULL OR ch."CrimeGroupName" = $1::text)
       AND ($2::int  IS NULL OR u."DistrictID" = $2::int)
       AND ($3::int  IS NULL OR ${TIME_COLUMN} >= NOW() - ($3::int * INTERVAL '1 day'))`,
    crimeGroup, districtId, days,
  );

  const rows = await db.$queryRawUnsafe<{ dow: number; hour: number; month: number; n: bigint }[]>(
    `SELECT ((EXTRACT(DOW FROM ${TIME_COLUMN})::int + 6) % 7) AS dow,
            EXTRACT(HOUR  FROM ${TIME_COLUMN})::int  AS hour,
            (EXTRACT(MONTH FROM ${TIME_COLUMN})::int - 1) AS month,
            COUNT(*) AS n
     FROM "CaseMaster" cm
     JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
     JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
     WHERE ${TIME_COLUMN} IS NOT NULL
       AND ($1::text IS NULL OR ch."CrimeGroupName" = $1::text)
       AND ($2::int  IS NULL OR u."DistrictID" = $2::int)
       AND ($3::int  IS NULL OR ${TIME_COLUMN} >= NOW() - ($3::int * INTERVAL '1 day'))
     GROUP BY 1, 2, 3`,
    crimeGroup, districtId, days,
  );

  const shaped = shapeBuckets(
    rows.map((r) => ({ dow: Number(r.dow), hour: Number(r.hour), month: Number(r.month), n: Number(r.n) })),
  );
  const { total, hour: hourCounts, weekday: weekdayCounts, month: monthCounts, grid } = shaped;

  // The column carries a clock only if the values actually use one. A corpus
  // where every incident lands at midnight has a timestamp type and no time,
  // and an hour panel drawn on it would be a single bar pretending to be a
  // finding — so the panel is withheld rather than faked.
  const hourSupported = hourCounts.some((c, h) => h !== 0 && c > 0);

  const crimeGroups = (
    await db.$queryRawUnsafe<{ name: string }[]>(
      `SELECT DISTINCT ch."CrimeGroupName" AS name
       FROM "CrimeHead" ch WHERE ch."Active" = true ORDER BY 1`,
    )
  ).map((r) => r.name);

  const hourLabels = Array.from({ length: HOUR_BUCKETS }, (_, h) => `${String(h).padStart(2, "0")}:00`);
  const lo = spanRows[0]?.lo ? new Date(spanRows[0].lo) : null;
  const hi = spanRows[0]?.hi ? new Date(spanRows[0].hi) : null;
  const cover = lo && hi ? coverageWeights(lo, hi) : null;
  const span = lo && hi
    ? `${lo.toISOString().slice(0, 10)} to ${hi.toISOString().slice(0, 10)}`
    : "no cases";

  return {
    total,
    hourSupported,
    hourSource: `CaseMaster.IncidentFromDate`,
    hour: axis(hourLabels, hourCounts, HOUR_WINDOW, describeHourWindow, cover?.hour),
    weekday: axis([...WEEKDAYS], weekdayCounts, WEEKDAY_WINDOW, describeWeekdayWindow, cover?.weekday),
    month: axis([...MONTHS], monthCounts, 1, (w) => (w.length ? MONTHS[w[0]] : ""), cover?.month),
    grid: hourSupported ? grid : [],
    crimeGroups,
    method:
      `Counts of cases by the hour, weekday and month of CaseMaster.IncidentFromDate — the only column in the schema that carries a time of day (CrimeRegisteredDate is a DATE, so it has no clock). Range covered: ${span}. ` +
      `Weekday and month are compared against the number of days the window actually gave each bucket, not a flat share, so a short window cannot manufacture a season. ` +
      `A window is called a peak only if the distribution fails a Pearson chi-square test against that baseline at p < ${SIGNIFICANCE}, with at least ${MIN_EXPECTED_PER_BUCKET} cases expected in every bucket tested; otherwise it is reported as within normal variation.`,
    generatedAt: new Date().toISOString(),
    filters: { crimeGroup, districtId, days },
  };
}
