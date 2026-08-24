import { prisma } from "./db";

/**
 * Predictive hotspots — where the next month's cases are likely to land, and
 * which station should be told.
 *
 * The map answers "where has crime happened". An officer allocating a shift
 * needs "where is it going". This fits the same transparent least-squares trend
 * the early-warning insights use, per district × crime group over six months,
 * and projects the next month. No black box: the output carries the slope, the
 * months it was fitted on, and how much of the variance the line actually
 * explains, so a projection can be argued with.
 *
 * Two deliberate limits, both honest about the data:
 *   - The forecast is per DISTRICT, not per station. At ~95 cases per station
 *     across the whole corpus a station-level trend is noise, and a confident
 *     line through noise is worse than no line.
 *   - Stations are still named, but by their SHARE of the district's recent
 *     cases in that crime group — an observed fact, not a projection. That is
 *     what turns "Burglary is rising in Tumakuru" into a patrol order.
 */

export interface HotspotDriver {
  crimeGroup: string;
  slopePerMonth: number;
  predicted: number;
  recent: number;
}

export interface HotspotDistrict {
  districtId: number;
  district: string;
  observed30: number;
  predicted30: number;
  delta: number;
  deltaPct: number;
  /** Sum of the per-group slopes — the district's overall direction. */
  slopePerMonth: number;
  confidence: "low" | "medium" | "high";
  drivers: HotspotDriver[];
}

export interface PatrolPriority {
  rank: number;
  districtId: number;
  district: string;
  crimeGroup: string;
  observed30: number;
  predicted30: number;
  slopePerMonth: number;
  fit: number;
  confidence: "low" | "medium" | "high";
  /** Stations carrying the district's recent load in this crime group. */
  stations: { station: string; cases: number; share: number }[];
  reason: string;
}

export interface HotspotForecast {
  horizonDays: number;
  generatedAt: string;
  method: string;
  months: string[];
  districts: HotspotDistrict[];
  priorities: PatrolPriority[];
}

const MONTHS_FITTED = 6;
const MIN_CASES_TO_FIT = 12;

/** Least squares over x = 0..n-1, plus the R² so the caller can judge the line. */
export function fitTrend(y: number[]): { slope: number; intercept: number; fit: number } {
  const n = y.length;
  const sx = (n * (n - 1)) / 2;
  const sxx = ((n - 1) * n * (2 * n - 1)) / 6;
  const sy = y.reduce((a, b) => a + b, 0);
  const sxy = y.reduce((a, b, i) => a + i * b, 0);
  const denom = n * sxx - sx * sx;
  if (!denom) return { slope: 0, intercept: sy / n, fit: 0 };

  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;

  const mean = sy / n;
  const ssTot = y.reduce((a, b) => a + (b - mean) ** 2, 0);
  const ssRes = y.reduce((a, b, i) => a + (b - (intercept + slope * i)) ** 2, 0);
  const fit = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  return { slope, intercept, fit };
}

/**
 * How much weight to put on the projection: enough history and a line that
 * actually tracks it, or not. Stated per cell so the UI never shows a number
 * without saying how much to trust it.
 */
function confidenceOf(total: number, fit: number): "low" | "medium" | "high" {
  if (total < MIN_CASES_TO_FIT) return "low";
  if (fit >= 0.6 && total >= 24) return "high";
  if (fit >= 0.3) return "medium";
  return "low";
}

/**
 * The last N COMPLETE months. The current month is always short — on the 4th it
 * holds four days of cases — and including it bends every trend downwards, so
 * the fit ends at last month and the projection is for the month now running.
 */
/** @internal exposed for tests */
export function monthBuckets(count = MONTHS_FITTED, now = new Date()): string[] {
  // UTC, because the SQL window is DATE_TRUNC('month', NOW()) on a session
  // running in GMT. Building these from local months instead means that between
  // midnight and 05:30 IST on the first of a month the two disagree: the oldest
  // month is dropped and the newest is filled with a zero, which drags every
  // district's slope negative and silently empties the patrol priorities.
  const out: string[] = [];
  for (let i = count; i >= 1; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export async function computeHotspots(horizonDays = 30): Promise<HotspotForecast> {
  const months = monthBuckets();
  const monthIdx = new Map(months.map((m, i) => [m, i]));

  const [series, observed, stationLoad] = await Promise.all([
    prisma.$queryRaw<{ district_id: number; district: string; crime_group: string; ym: string; n: bigint }[]>`
      SELECT d."DistrictID" AS district_id, d."DistrictName" AS district,
             ch."CrimeGroupName" AS crime_group,
             TO_CHAR(DATE_TRUNC('month', cm."CrimeRegisteredDate"), 'YYYY-MM') AS ym,
             COUNT(*) AS n
      FROM "CaseMaster" cm
      JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
      JOIN "District" d ON d."DistrictID" = u."DistrictID"
      JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
      WHERE cm."CrimeRegisteredDate" >= DATE_TRUNC('month', NOW()) - INTERVAL '6 months'
        AND cm."CrimeRegisteredDate" <  DATE_TRUNC('month', NOW())
      GROUP BY 1, 2, 3, 4
    `,
    prisma.$queryRaw<{ district_id: number; crime_group: string; n: bigint }[]>`
      SELECT d."DistrictID" AS district_id, ch."CrimeGroupName" AS crime_group, COUNT(*) AS n
      FROM "CaseMaster" cm
      JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
      JOIN "District" d ON d."DistrictID" = u."DistrictID"
      JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
      WHERE cm."CrimeRegisteredDate" >= NOW() - INTERVAL '30 days'
      GROUP BY 1, 2
    `,
    // Where the load actually sits inside a district — last 90 days, so the
    // named stations reflect current pressure rather than history.
    prisma.$queryRaw<{ district_id: number; crime_group: string; station: string; n: bigint }[]>`
      SELECT d."DistrictID" AS district_id, ch."CrimeGroupName" AS crime_group,
             u."UnitName" AS station, COUNT(*) AS n
      FROM "CaseMaster" cm
      JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
      JOIN "District" d ON d."DistrictID" = u."DistrictID"
      JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
      WHERE cm."CrimeRegisteredDate" >= NOW() - INTERVAL '90 days'
      GROUP BY 1, 2, 3
    `,
  ]);

  type Cell = { districtId: number; district: string; crimeGroup: string; y: number[] };
  const cells = new Map<string, Cell>();
  for (const r of series) {
    const key = `${r.district_id}|${r.crime_group}`;
    let c = cells.get(key);
    if (!c) {
      c = { districtId: Number(r.district_id), district: r.district, crimeGroup: r.crime_group, y: Array(MONTHS_FITTED).fill(0) };
      cells.set(key, c);
    }
    const i = monthIdx.get(r.ym);
    if (i !== undefined) c.y[i] = Number(r.n);
  }

  const observedBy = new Map(observed.map((o) => [`${o.district_id}|${o.crime_group}`, Number(o.n)]));

  const stationsBy = new Map<string, { station: string; cases: number }[]>();
  for (const s of stationLoad) {
    const key = `${s.district_id}|${s.crime_group}`;
    (stationsBy.get(key) ?? stationsBy.set(key, []).get(key)!).push({ station: s.station, cases: Number(s.n) });
  }

  const scale = horizonDays / 30; // the fit is monthly; a different horizon just scales it

  const priorities: PatrolPriority[] = [];
  const byDistrict = new Map<number, HotspotDistrict>();

  for (const c of cells.values()) {
    const total = c.y.reduce((a, b) => a + b, 0);
    const { slope, intercept, fit } = fitTrend(c.y);
    const predicted = Math.max(0, Math.round((intercept + slope * MONTHS_FITTED) * scale));
    const key = `${c.districtId}|${c.crimeGroup}`;
    const observed30 = observedBy.get(key) ?? 0;
    const confidence = confidenceOf(total, fit);

    let d = byDistrict.get(c.districtId);
    if (!d) {
      d = {
        districtId: c.districtId, district: c.district,
        observed30: 0, predicted30: 0, delta: 0, deltaPct: 0,
        slopePerMonth: 0, confidence: "low", drivers: [],
      };
      byDistrict.set(c.districtId, d);
    }
    d.observed30 += observed30;
    d.predicted30 += predicted;
    d.slopePerMonth += slope;
    if (slope > 0) {
      d.drivers.push({ crimeGroup: c.crimeGroup, slopePerMonth: Number(slope.toFixed(2)), predicted, recent: c.y[MONTHS_FITTED - 1] });
    }

    // A patrol priority needs a rising line worth acting on and enough history
    // to have drawn it — otherwise it is a suggestion built out of two months.
    if (slope <= 0.5 || total < MIN_CASES_TO_FIT || predicted <= observed30) continue;

    const stations = (stationsBy.get(key) ?? []).sort((a, b) => b.cases - a.cases);
    const districtTotal = stations.reduce((a, s) => a + s.cases, 0) || 1;
    const top = stations.slice(0, 3).map((s) => ({ ...s, share: Math.round((s.cases / districtTotal) * 100) }));
    const covered = top.reduce((a, s) => a + s.share, 0);

    priorities.push({
      rank: 0,
      districtId: c.districtId,
      district: c.district,
      crimeGroup: c.crimeGroup,
      observed30,
      predicted30: predicted,
      slopePerMonth: Number(slope.toFixed(2)),
      fit: Number(fit.toFixed(2)),
      confidence,
      stations: top,
      reason:
        `${c.crimeGroup} in ${c.district} is rising about ${slope.toFixed(1)} cases/month ` +
        `(${observed30} in the last 30 days, ${predicted} projected for the next ${horizonDays}). ` +
        (top.length
          ? `${covered}% of the last 90 days sat at ${top.map((s) => `${s.station} (${s.share}%)`).join(", ")}.`
          : `No station breakdown in the last 90 days.`),
    });
  }

  const districts = [...byDistrict.values()]
    .map((d) => {
      d.drivers.sort((a, b) => b.slopePerMonth - a.slopePerMonth);
      d.drivers = d.drivers.slice(0, 3);
      d.delta = d.predicted30 - d.observed30;
      d.deltaPct = d.observed30 > 0 ? Math.round((d.delta / d.observed30) * 100) : 0;
      d.slopePerMonth = Number(d.slopePerMonth.toFixed(2));
      // The district inherits the best-supported cell it is made of: one solid
      // rising group is worth more than a dozen thin ones.
      const best = priorities.filter((p) => p.districtId === d.districtId).sort((a, b) => b.fit - a.fit)[0];
      d.confidence = best?.confidence ?? "low";
      return d;
    })
    .sort((a, b) => b.predicted30 - a.predicted30);

  // Rank on the uplift a shift would actually absorb, discounted by how well
  // the line fits. Without the discount the top of the list fills with thin
  // cells where a jump from one case to eight is arithmetic, not a trend.
  const priority = (p: PatrolPriority) => (p.predicted30 - p.observed30) * Math.max(p.fit, 0.05);
  priorities.sort((a, b) => priority(b) - priority(a) || b.slopePerMonth - a.slopePerMonth);
  priorities.forEach((p, i) => { p.rank = i + 1; });

  return {
    horizonDays,
    generatedAt: new Date().toISOString(),
    method: `Least-squares trend per district × crime group over the last ${MONTHS_FITTED} complete months (${months[0]} to ${months[MONTHS_FITTED - 1]}), projected one month ahead${scale === 1 ? "" : ` and scaled to ${horizonDays} days`}. The current month is excluded from the fit because it is always partial. Stations are ranked by their share of the district's last 90 days, not forecast.`,
    months,
    districts,
    priorities: priorities.slice(0, 12),
  };
}
