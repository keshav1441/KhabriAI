import { NextRequest } from "next/server";
import { computeInsights } from "@/lib/insights-compute";
import { setCachedInsights } from "@/lib/insights-cache";

export const dynamic = "force-dynamic";

/**
 * Precompute target for Catalyst Job Scheduling (Phase 3). A scheduled job
 * hits this route on an interval so `/api/insights` reads a warm cache
 * instead of recomputing on every dashboard load.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (expected && provided !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const insights = await computeInsights();
    await setCachedInsights(insights, req);
    return Response.json({ ok: true, count: insights.length });
  } catch (e) {
    console.error("Insights cron error:", e);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
