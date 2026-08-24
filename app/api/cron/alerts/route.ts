import { NextRequest } from "next/server";
import { generateAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled target for Catalyst Job Scheduling: runs the detectors and pushes
 * new findings into every officer's alert feed. Secret-gated the same way as
 * the insights precompute job.
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
    const result = await generateAlerts();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    console.error("Alerts cron error:", e);
    return Response.json({ ok: false, error: "Alert generation failed" }, { status: 500 });
  }
}
