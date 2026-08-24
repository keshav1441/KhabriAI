import { NextRequest } from "next/server";
import { requireUser, scopedDb } from "@/lib/chat-auth";
import { buildCustodyBoard, type CustodyFilter } from "@/lib/custody";

export const dynamic = "force-dynamic";

const FILTERS: CustodyFilter[] = ["all", "none", "csNoCustody", "stale"];

const EMPTY_SUMMARY = { liveCases: 0, noneBroughtIn: 0, csNoCustody: 0, stale: 0, accusedTotal: 0, broughtInTotal: 0 };

/**
 * GET /api/custody?filter=all|none|csNoCustody|stale&limit=100
 *
 * The custody column behind "My Desk". Like /api/pendency it runs entirely
 * inside scopedDb, so an SHO sees their district's custody position and nothing
 * else — the RLS policies do the cutting, not a WHERE clause this route could
 * forget to write. The summary is counted in SQL over the whole scoped set, so
 * it keeps its meaning while a filter is on.
 */
export async function GET(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;
  const { db, scope } = await scopedDb(req);

  const { searchParams } = new URL(req.url);
  const requested = searchParams.get("filter") ?? "all";
  const filter: CustodyFilter = (FILTERS as string[]).includes(requested) ? (requested as CustodyFilter) : "all";
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 100, 1), 500);

  try {
    const board = await buildCustodyBoard(db, { filter, limit });
    return Response.json({ ...board, filter, scope: scope.districtName });
  } catch (e) {
    // Matching /api/pendency: a column that fails to load should read as an
    // empty column, not as a broken desk.
    console.error("custody load failed:", e);
    return Response.json({
      rows: [],
      summary: EMPTY_SUMMARY,
      typeResolution: { resolved: false, distinctTypeIds: [], reason: "custody lookup failed" },
      generatedAt: new Date().toISOString(),
      filter,
      scope: scope.districtName,
    });
  }
}
