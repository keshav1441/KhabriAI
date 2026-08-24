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
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (expected && provided !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateAlerts();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    console.error("Alerts cron error:", e);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
