import { NextRequest } from "next/server";
import { requireReviewer } from "@/lib/admin-auth";
import { listAuditRuns } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * The audit trail, grouped by run. Reviewer-gated: these rows carry other
 * officers' questions, which can name real people.
 */
export async function GET(req: NextRequest) {
  const { denied } = await requireReviewer(req);
  if (denied) return denied;

  const q = req.nextUrl.searchParams;
  const status = q.get("status");

  try {
    const runs = await listAuditRuns({
      officer: q.get("officer") ?? undefined,
      tool: q.get("tool") ?? undefined,
      scope: q.get("scope") ?? undefined,
      status: status === "ok" || status === "error" ? status : undefined,
      q: q.get("q") ?? undefined,
      days: Number(q.get("days")) || 30,
      limit: Number(q.get("limit")) || 50,
    });
    return Response.json({ runs });
  } catch (e) {
    console.error("audit list failed:", e);
    return Response.json({ error: "Could not read the audit trail" }, { status: 500 });
  }
}
