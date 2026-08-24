import { NextRequest } from "next/server";
import { requireReviewer } from "@/lib/admin-auth";
import { misuseReport } from "@/lib/misuse";

export const dynamic = "force-dynamic";

/**
 * What the audit trail says about how the tool is being used.
 *
 * Reviewer-gated like its siblings, and for a sharper reason than theirs: the
 * findings name officers and the people they searched for. Not cached — a
 * reviewer opening this has usually just been told about something, and a
 * stale answer to "is this happening now" is worse than a slow one.
 */
export async function GET(req: NextRequest) {
  const { denied } = await requireReviewer(req);
  if (denied) return denied;

  const days = Number(req.nextUrl.searchParams.get("days")) || 30;

  try {
    const report = await misuseReport(Math.min(Math.max(days, 1), 365));
    return Response.json({ report });
  } catch (e) {
    console.error("misuse report failed:", e);
    return Response.json({ error: "Could not read the audit trail" }, { status: 500 });
  }
}
