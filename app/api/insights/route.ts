import { NextRequest } from "next/server";
import { computeInsights } from "@/lib/insights-compute";
import { getCachedInsights, setCachedInsights } from "@/lib/insights-cache";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const cached = await getCachedInsights(req);
    if (cached) return Response.json({ insights: cached });

    const insights = await computeInsights();
    await setCachedInsights(insights, req);
    return Response.json({ insights });
  } catch (e) {
    console.error("Insights error:", e);
    return Response.json({ insights: [] });
  }
}
