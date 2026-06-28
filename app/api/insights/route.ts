import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const insights: { type: string; title: string; detail: string; query: string }[] = [];

    // Anomaly 1: Districts with 40%+ crime spike this month vs last month
    const spikeResult = await prisma.$queryRaw<
      { district_name: string; this_month: bigint; last_month: bigint }[]
    >`
      SELECT
        d."DistrictName" AS district_name,
        COUNT(*) FILTER (WHERE cm."CrimeRegisteredDate" >= DATE_TRUNC('month', NOW())) AS this_month,
        COUNT(*) FILTER (WHERE cm."CrimeRegisteredDate" >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
                           AND cm."CrimeRegisteredDate" <  DATE_TRUNC('month', NOW())) AS last_month
      FROM "CaseMaster" cm
      JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
      JOIN "District" d ON d."DistrictID" = u."DistrictID"
      GROUP BY d."DistrictName"
      HAVING
        COUNT(*) FILTER (WHERE cm."CrimeRegisteredDate" >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
                           AND cm."CrimeRegisteredDate" <  DATE_TRUNC('month', NOW())) > 3
        AND COUNT(*) FILTER (WHERE cm."CrimeRegisteredDate" >= DATE_TRUNC('month', NOW()))
          > COUNT(*) FILTER (WHERE cm."CrimeRegisteredDate" >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
                              AND cm."CrimeRegisteredDate" <  DATE_TRUNC('month', NOW())) * 1.4
      ORDER BY this_month DESC
      LIMIT 3
    `;

    for (const row of spikeResult) {
      const thisMonth = Number(row.this_month);
      const lastMonth = Number(row.last_month);
      const pct = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : 0;
      insights.push({
        type: "spike",
        title: `Crime spike in ${row.district_name}`,
        detail: `${pct}% increase this month (${thisMonth} vs ${lastMonth} last month)`,
        query: `Show crime breakdown in ${row.district_name} for the last 2 months`,
      });
    }

    // Anomaly 2: Repeat accused with 3+ cases in last 30 days
    const repeatResult = await prisma.$queryRaw<
      { accused_name: string; case_count: bigint; crime_types: string }[]
    >`
      SELECT
        a."AccusedName" AS accused_name,
        COUNT(DISTINCT a."CaseMasterID") AS case_count,
        STRING_AGG(DISTINCT ch."CrimeGroupName", ', ') AS crime_types
      FROM "Accused" a
      JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID"
      JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
      WHERE cm."CrimeRegisteredDate" >= NOW() - INTERVAL '30 days'
        AND a."AccusedName" IS NOT NULL
      GROUP BY a."AccusedName"
      HAVING COUNT(DISTINCT a."CaseMasterID") >= 3
      ORDER BY case_count DESC
      LIMIT 2
    `;

    for (const row of repeatResult) {
      insights.push({
        type: "repeat_suspect",
        title: `Repeat accused: ${row.accused_name}`,
        detail: `Linked to ${Number(row.case_count)} cases in last 30 days (${row.crime_types})`,
        query: `Show all cases linked to accused ${row.accused_name} in the last 30 days`,
      });
    }

    // Anomaly 3: Crime category surge statewide this week
    const weekResult = await prisma.$queryRaw<
      { crime_type: string; this_week: bigint; last_week: bigint }[]
    >`
      SELECT
        ch."CrimeGroupName" AS crime_type,
        COUNT(*) FILTER (WHERE cm."CrimeRegisteredDate" >= NOW() - INTERVAL '7 days') AS this_week,
        COUNT(*) FILTER (WHERE cm."CrimeRegisteredDate" >= NOW() - INTERVAL '14 days'
                           AND cm."CrimeRegisteredDate" <  NOW() - INTERVAL '7 days') AS last_week
      FROM "CaseMaster" cm
      JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
      GROUP BY ch."CrimeGroupName"
      HAVING COUNT(*) FILTER (WHERE cm."CrimeRegisteredDate" >= NOW() - INTERVAL '7 days') > 5
      ORDER BY this_week DESC
      LIMIT 1
    `;

    for (const row of weekResult) {
      const thisWeek = Number(row.this_week);
      const lastWeek = Number(row.last_week);
      if (thisWeek > lastWeek * 1.3) {
        const pct = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : 0;
        insights.push({
          type: "weekly_surge",
          title: `${row.crime_type} surging statewide`,
          detail: `${pct}% more ${row.crime_type} cases this week vs last week`,
          query: `Show ${row.crime_type} hotspots in the last 7 days with map`,
        });
      }
    }

    return Response.json({ insights });
  } catch (e) {
    console.error("Insights error:", e);
    return Response.json({ insights: [] });
  }
}
