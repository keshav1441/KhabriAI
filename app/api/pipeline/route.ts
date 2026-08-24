import { NextRequest } from "next/server";
import { requireUser, scopedDb } from "@/lib/chat-auth";
import { buildStages, computePipeline, pickBottleneck } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

/**
 * GET /api/pipeline?district=Kolar&crimeGroup=Theft&months=24
 *
 * The funnel runs entirely inside scopedDb: an SHO asking for another
 * district's pipeline gets their own, because RLS cuts the rows before the
 * arithmetic ever sees them — the district parameter narrows, it never widens.
 */
export async function GET(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;
  const { db, scope } = await scopedDb(req);

  const { searchParams } = new URL(req.url);
  const district = searchParams.get("district")?.trim() || null;
  const crimeGroup = searchParams.get("crimeGroup")?.trim() || null;
  const windowMonths = Math.min(Math.max(Number(searchParams.get("months")) || 24, 1), 120);

  try {
    const pipeline = await computePipeline(db, { district, crimeGroup, windowMonths });
    return Response.json({ ...pipeline, filters: { district, crimeGroup, windowMonths }, scope: scope.districtName });
  } catch (e) {
    // Same contract as the pendency route: a failed load reads as an empty
    // funnel with the stages still named, not as a broken screen.
    console.error("pipeline load failed:", e);
    const stages = buildStages([]);
    return Response.json({
      totalCases: 0,
      windowMonths,
      stages,
      bottleneck: pickBottleneck(stages),
      byDistrict: [],
      byCrimeGroup: [],
      slowest: [],
      method: "",
      generatedAt: new Date().toISOString(),
      filters: { district, crimeGroup, windowMonths },
      scope: scope.districtName,
    });
  }
}
