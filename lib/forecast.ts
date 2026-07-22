import { prisma } from "./db";
import type { InsightItem } from "./insights-cache";

// Predictive early-warning: per district × crime group, fit a transparent
// linear trend over the last 6 months and project next month. No black-box ML
// — the method is a least-squares slope, so it's fully explainable ("rising at
// N cases/month, projected M next month"). Flags the cells with the strongest
// upward momentum and enough volume to matter.
export async function computeForecasts(topN = 4): Promise<InsightItem[]> {
  const rows = await prisma.$queryRaw<
    { district: string; crime_group: string; ym: string; n: bigint }[]
  >`
    SELECT d."DistrictName" AS district,
           ch."CrimeGroupName" AS crime_group,
           TO_CHAR(DATE_TRUNC('month', cm."CrimeRegisteredDate"), 'YYYY-MM') AS ym,
           COUNT(*) AS n
    FROM "CaseMaster" cm
    JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
    JOIN "District" d ON d."DistrictID" = u."DistrictID"
    JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
    WHERE cm."CrimeRegisteredDate" >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
    GROUP BY 1, 2, 3
  `;

  // Ordered list of the 6 month buckets we expect (oldest → newest).
  const months: string[] = [];
  {
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
  }
  const monthIdx = new Map(months.map((m, i) => [m, i]));

  // Build a 6-point series per district|crime-group.
  const series = new Map<string, { district: string; crime: string; y: number[] }>();
  for (const r of rows) {
    const key = `${r.district}||${r.crime_group}`;
    let s = series.get(key);
    if (!s) { s = { district: r.district, crime: r.crime_group, y: Array(6).fill(0) }; series.set(key, s); }
    const idx = monthIdx.get(r.ym);
    if (idx !== undefined) s.y[idx] = Number(r.n);
  }

  const forecasts: (InsightItem & { score: number })[] = [];
  for (const s of series.values()) {
    const total = s.y.reduce((a, b) => a + b, 0);
    if (total < 12) continue; // need enough history to trust a trend

    // Least-squares slope over x = 0..5.
    const n = 6, sx = 15, sxx = 55; // fixed for x=0..5
    const sy = s.y.reduce((a, b) => a + b, 0);
    const sxy = s.y.reduce((a, b, i) => a + i * b, 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const intercept = (sy - slope * sx) / n;
    const projected = Math.max(0, Math.round(intercept + slope * 6)); // next month (x=6)
    const recent = s.y[5];

    if (slope <= 0.5 || projected <= recent) continue; // only rising cells

    forecasts.push({
      type: "forecast",
      title: `${s.crime} rising in ${s.district}`,
      detail: `Trending up ~${slope.toFixed(1)}/month · projected ${projected} next month (vs ${recent} this month)`,
      query: `Show monthly trend of ${s.crime} in ${s.district}`,
      score: slope + (projected - recent),
    });
  }

  return forecasts
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(({ type, title, detail, query }) => ({ type, title, detail, query }));
}
