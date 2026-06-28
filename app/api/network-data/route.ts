import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await prisma.$queryRaw<
      { AccusedName: string; case_count: bigint; crime_types: string }[]
    >`
      SELECT
        a."AccusedName"                                    AS "AccusedName",
        COUNT(DISTINCT a."CaseMasterID")                   AS case_count,
        STRING_AGG(DISTINCT ch."CrimeGroupName", ', ')     AS crime_types
      FROM "Accused" a
      JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID"
      JOIN "CrimeHead"  ch ON ch."CrimeHeadID"  = cm."CrimeMajorHeadID"
      WHERE a."AccusedName" IS NOT NULL
        AND a."AccusedName" != ''
      GROUP BY a."AccusedName"
      HAVING COUNT(DISTINCT a."CaseMasterID") >= 2
      ORDER BY case_count DESC
      LIMIT 80
    `;
    return Response.json({
      rows: rows.map((r) => ({
        AccusedName: r.AccusedName,
        case_count: Number(r.case_count),
        crime_types: r.crime_types,
      })),
    });
  } catch (e) {
    console.error(e);
    return Response.json({ rows: [] });
  }
}
