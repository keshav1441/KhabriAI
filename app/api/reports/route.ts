import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/chat-auth";

export const dynamic = "force-dynamic";

type ReportRow = {
  case_id: number;
  crime_no: string;
  case_no: string;
  date_registered: Date | null;
  crime_group: string;
  district: string;
  status: string;
};

export async function GET(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 200);

  try {
    let rows: ReportRow[];

    if (search) {
      const like = `%${search}%`;
      rows = await prisma.$queryRaw<ReportRow[]>`
        SELECT
          cm."CaseMasterID"               AS case_id,
          cm."CrimeNo"                    AS crime_no,
          cm."CaseNo"                     AS case_no,
          cm."CrimeRegisteredDate"        AS date_registered,
          ch."CrimeGroupName"             AS crime_group,
          d."DistrictName"                AS district,
          COALESCE(cs."CaseStatusName", 'Unknown') AS status
        FROM "CaseMaster" cm
        JOIN "CrimeHead"  ch ON ch."CrimeHeadID"  = cm."CrimeMajorHeadID"
        JOIN "Unit"       u  ON u."UnitID"         = cm."PoliceStationID"
        JOIN "District"   d  ON d."DistrictID"     = u."DistrictID"
        LEFT JOIN "CaseStatusMaster" cs ON cs."CaseStatusID" = cm."CaseStatusID"
        WHERE
          d."DistrictName"    ILIKE ${like}
          OR ch."CrimeGroupName" ILIKE ${like}
          OR cm."CrimeNo"::text ILIKE ${like}
        ORDER BY cm."CrimeRegisteredDate" DESC NULLS LAST
        LIMIT ${limit}
      `;
    } else {
      rows = await prisma.$queryRaw<ReportRow[]>`
        SELECT
          cm."CaseMasterID"               AS case_id,
          cm."CrimeNo"                    AS crime_no,
          cm."CaseNo"                     AS case_no,
          cm."CrimeRegisteredDate"        AS date_registered,
          ch."CrimeGroupName"             AS crime_group,
          d."DistrictName"                AS district,
          COALESCE(cs."CaseStatusName", 'Unknown') AS status
        FROM "CaseMaster" cm
        JOIN "CrimeHead"  ch ON ch."CrimeHeadID"  = cm."CrimeMajorHeadID"
        JOIN "Unit"       u  ON u."UnitID"         = cm."PoliceStationID"
        JOIN "District"   d  ON d."DistrictID"     = u."DistrictID"
        LEFT JOIN "CaseStatusMaster" cs ON cs."CaseStatusID" = cm."CaseStatusID"
        ORDER BY cm."CrimeRegisteredDate" DESC NULLS LAST
        LIMIT ${limit}
      `;
    }

    return Response.json({
      cases: rows.map((r) => ({
        ...r,
        case_id: Number(r.case_id),
        date_registered: r.date_registered
          ? new Date(r.date_registered).toISOString().slice(0, 10)
          : null,
      })),
    });
  } catch (e) {
    console.error(e);
    return Response.json({ cases: [] });
  }
}
