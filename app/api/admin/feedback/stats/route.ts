import { NextRequest } from "next/server";
import { requireReviewer } from "@/lib/admin-auth";
import { feedbackStats } from "@/lib/feedback";

export const dynamic = "force-dynamic";

/** Totals, the daily satisfaction line, and how many examples the review queue has produced. */
export async function GET(req: NextRequest) {
  const { denied } = await requireReviewer(req);
  if (denied) return denied;

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days")) || 30, 7), 180);
  try {
    return Response.json({ stats: await feedbackStats(days), days });
  } catch (e) {
    console.error("feedback stats failed:", e);
    return Response.json({ error: "Could not compute the stats" }, { status: 500 });
  }
}
