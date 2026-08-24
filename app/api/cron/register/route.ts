import { NextRequest } from "next/server";
import { ensureAlertsCron, getAlertsCron, runAlertsCronNow } from "@/lib/catalyst-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Registers (or inspects) the Catalyst schedule that drives proactive alerts.
 * Creating platform infrastructure is not something a session cookie should be
 * able to do, so this is gated on CRON_SECRET like the job endpoints it
 * registers — and refuses outright when no secret is configured.
 */
function authorize(req: NextRequest): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return Response.json({ error: "CRON_SECRET is not set — set it before registering a schedule" }, { status: 503 });
  }
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== expected) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

/** Current state of the schedule: registered or not, how often, what it calls. */
export async function GET(req: NextRequest) {
  const denied = authorize(req);
  if (denied) return denied;
  try {
    return Response.json({ ok: true, cron: await getAlertsCron(req) });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}

/**
 * `POST` registers the cron (no-op if it already exists).
 * `?force=true` recreates it — how you change the interval or target URL.
 * `?run=true` fires it once immediately afterwards.
 */
export async function POST(req: NextRequest) {
  const denied = authorize(req);
  if (denied) return denied;
  const force = req.nextUrl.searchParams.get("force") === "true";
  const runNow = req.nextUrl.searchParams.get("run") === "true";
  try {
    const cron = await ensureAlertsCron(req, { force });
    const run = runNow ? await runAlertsCronNow(req) : null;
    return Response.json({ ok: true, cron, run });
  } catch (e) {
    console.error("cron registration failed:", e);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
