import { NextRequest } from "next/server";
import { requireReviewer } from "@/lib/admin-auth";
import { auditSummary } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Volume, failures and per-tool latency over the window, plus the filter vocabulary. */
export async function GET(req: NextRequest) {
  const { denied } = await requireReviewer(req);
  if (denied) return denied;

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days")) || 30, 1), 365);
  try {
    return Response.json({ summary: await auditSummary(days), days });
  } catch (e) {
    console.error("audit summary failed:", e);
    return Response.json({ error: "Could not summarise the audit trail" }, { status: 500 });
  }
}
