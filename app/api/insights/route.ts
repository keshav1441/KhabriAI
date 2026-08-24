import { NextRequest } from "next/server";
import { computeInsights } from "@/lib/insights-compute";
import { getCachedInsights, setCachedInsights } from "@/lib/insights-cache";
import { requireUser, getScope } from "@/lib/chat-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;
  try {
    const cached = await getCachedInsights(req);
    const insights = cached ?? (await computeInsights());
    if (!cached) await setCachedInsights(insights, req);

    // The cache holds the statewide set; the cut happens per officer on the way
    // out, the same way /api/forecast/hotspots does it. A district-posted
    // officer must not be handed another district's spike - or, worse, the name
    // of an accused they have no business reading.
    const { districtId } = await getScope(req);
    if (!districtId) return Response.json({ insights });

    return Response.json({
      insights: insights.filter((i) => {
        if (i.districtId === districtId) return true;
        if (i.districtId != null) return false;
        // A statewide finding is fair game unless it names a person: the
        // repeat-accused detector deliberately nulls the district when someone
        // is active in several, and that name is still out of scope here.
        return i.type !== "repeat_suspect";
      }),
    });
  } catch (e) {
    console.error("Insights error:", e);
    return Response.json({ insights: [] });
  }
}
