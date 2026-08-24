import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/chat-auth";
import { generateAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Run detection now. The scheduled job (`/api/cron/alerts`) is the real path;
 * this is the same engine behind a signed-in button, so a demo does not have
 * to wait for the cron interval.
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await generateAlerts();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    console.error("alert generation failed:", e);
    return Response.json({ ok: false, error: "Alert generation failed" }, { status: 500 });
  }
}
