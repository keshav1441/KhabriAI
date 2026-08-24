import { NextRequest } from "next/server";
import { computeInsights } from "@/lib/insights-compute";
import { setCachedInsights } from "@/lib/insights-cache";
import { generateAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";

/**
 * Precompute target for Catalyst Job Scheduling (Phase 3). A scheduled job
 * hits this route on an interval so `/api/insights` reads a warm cache
 * instead of recomputing on every dashboard load.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  // Fail closed: an unset secret used to mean "no guard at all", which left a
  // 300-second job anyone could trigger.
  if (!expected) {
    return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const insights = await computeInsights();
    await setCachedInsights(insights, req);
    // Same schedule pushes the findings out as alerts, so one scheduled job
    // keeps both the dashboard panel warm and the officers' feeds current.
    const alerts = await generateAlerts().catch((e) => {
      console.error("alert fan-out failed:", e);
      return { created: 0, users: 0, findings: 0 };
    });
    return Response.json({ ok: true, count: insights.length, alerts });
  } catch (e) {
    console.error("Insights cron error:", e);
    return Response.json({ ok: false, error: "Insight precompute failed" }, { status: 500 });
  }
}
