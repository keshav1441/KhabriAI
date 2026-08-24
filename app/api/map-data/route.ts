import { NextRequest } from "next/server";
import { requireUser, scopedDb } from "@/lib/chat-auth";
import { fetchIncidentPoints, type Bounds } from "@/lib/map-points";

export const dynamic = "force-dynamic";

/** `bbox=south,west,north,east`. Anything malformed is ignored rather than 400'd — a bad viewport should not blank the map. */
function parseBbox(raw: string | null): Bounds | undefined {
  if (!raw) return undefined;
  const n = raw.split(",").map(Number);
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) return undefined;
  const [south, west, north, east] = n;
  if (south > north || west > east) return undefined;
  return { south, west, north, east };
}

export async function GET(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;
  const { db, scope } = await scopedDb(req);

  // ?mode=points is the incident layer; no mode keeps the district counts the
  // Observed layer has always read, byte for byte.
  if (req.nextUrl.searchParams.get("mode") === "points") {
    const p = req.nextUrl.searchParams;
    try {
      const result = await fetchIncidentPoints(db, {
        bounds: parseBbox(p.get("bbox")),
        crimeGroup: p.get("group") ?? undefined,
        from: p.get("from") ?? undefined,
        to: p.get("to") ?? undefined,
        cap: p.get("cap") ? Number(p.get("cap")) : undefined,
      });
      return Response.json({ ...result, scope: scope.districtName ?? undefined });
    } catch (e) {
      console.error(e);
      return Response.json({ points: [], total: 0, missingCoords: 0, cap: 0, capped: false });
    }
  }

  try {
    const rows = await db.$queryRaw<
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
