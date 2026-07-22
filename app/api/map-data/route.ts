import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/chat-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;
  try {
    const rows = await prisma.$queryRaw<
      { district_name: string; case_count: bigint }[]
    >`
      SELECT
        d."DistrictName" AS district_name,
        COUNT(*)         AS case_count
      FROM "CaseMaster" cm
      JOIN "Unit"     u ON u."UnitID"     = cm."PoliceStationID"
      JOIN "District" d ON d."DistrictID" = u."DistrictID"
      GROUP BY d."DistrictName"
      ORDER BY case_count DESC
    `;
    return Response.json({
      districts: rows.map((r) => ({
        name: r.district_name,
        count: Number(r.case_count),
      })),
    });
  } catch (e) {
    console.error(e);
    return Response.json({ districts: [] });
  }
}
