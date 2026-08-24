import { NextRequest } from "next/server";
import { requireUser, getScope } from "@/lib/chat-auth";
import { computeHotspots } from "@/lib/hotspot-forecast";
import { cacheGet, cacheSet } from "@/lib/catalyst-cache";

export const dynamic = "force-dynamic";

const TTL_MINUTES = 180;

/**
 * Where the next month's cases are projected to land, and which stations carry
 * the load inside those districts. Cached like the insight panel — the fit only
 * moves when a month closes, so recomputing per page load buys nothing.
 *
 * A district-posted officer sees their own district; the projection for a
 * district they cannot see cases in is not theirs to act on.
 */
export async function GET(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;

  const horizon = Math.min(Math.max(Number(req.nextUrl.searchParams.get("horizon")) || 30, 7), 90);
  const key = `hotspots:${horizon}`;

  try {
    const cached = await cacheGet(key, req);
    const forecast = cached
      ? (JSON.parse(cached) as Awaited<ReturnType<typeof computeHotspots>>)
      : await computeHotspots(horizon);
    if (!cached) await cacheSet(key, JSON.stringify(forecast), TTL_MINUTES, req);

    const { districtId, districtName } = await getScope(req);
    if (!districtId) return Response.json({ forecast });

    return Response.json({
      forecast: {
        ...forecast,
        districts: forecast.districts.filter((d) => d.districtId === districtId),
        priorities: forecast.priorities
          .filter((p) => p.districtId === districtId)
          .map((p, i) => ({ ...p, rank: i + 1 })),
      },
      scope: districtName,
    });
  } catch (e) {
    console.error("hotspot forecast failed:", e);
    return Response.json({ error: "Failed to compute the forecast" }, { status: 500 });
  }
}
