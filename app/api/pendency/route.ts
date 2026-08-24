import { NextRequest } from "next/server";
import { requireUser, scopedDb } from "@/lib/chat-auth";
import { buildDesk, type PendencyFilter } from "@/lib/pendency";

export const dynamic = "force-dynamic";

const FILTERS: PendencyFilter[] = ["all", "overdue", "noArrest"];

/**
 * GET /api/pendency?filter=all|overdue|noArrest&limit=100
 *
 * The desk runs entirely inside scopedDb, so an SHO's pendency is their
 * district's pendency — the RLS policies do the cutting, not a WHERE clause
 * this route could forget to write.
 */
export async function GET(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;
  const { db, scope } = await scopedDb(req);

  const { searchParams } = new URL(req.url);
  const requested = searchParams.get("filter") ?? "all";
  const filter: PendencyFilter = (FILTERS as string[]).includes(requested) ? (requested as PendencyFilter) : "all";
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 100, 1), 200);

  try {
    const desk = await buildDesk(db, { filter, limit });
    return Response.json({ ...desk, filter, scope: scope.districtName });
  } catch (e) {
    // Match the reports route: a desk that fails to load should read as an
    // empty desk with a zeroed strip, not as a broken screen.
    console.error("pendency load failed:", e);
    return Response.json({
      rows: [],
      summary: { openCases: 0, overdue: 0, noArrest: 0, medianAgeDays: null },
      generatedAt: new Date().toISOString(),
      filter,
      scope: scope.districtName,
    });
  }
}
