import { NextRequest } from "next/server";
import { requireUser, scopedDb } from "@/lib/chat-auth";
import { computeTimePatterns } from "@/lib/time-patterns";

export const dynamic = "force-dynamic";

/**
 * GET /api/patterns?group=<CrimeGroupName>&district=<DistrictID>&days=<lookback>
 *
 * "When crime happens" — the hour/weekday/month shape of the caseload.
 *
 * Runs entirely on scopedDb, so an SHO's patterns are their district's
 * patterns: the RLS transaction cuts the rows before they are counted, and the
 * `district` parameter can only narrow inside that scope, never widen it.
 */
export async function GET(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;
  const { db, scope } = await scopedDb(req);

  const { searchParams } = new URL(req.url);
  const group = searchParams.get("group");
  const districtRaw = Number(searchParams.get("district"));
  const daysRaw = Number(searchParams.get("days"));

  // "all" is the UI's word for no filter; treat it as absent rather than as a
  // crime group nobody will ever match.
  const crimeGroup = !group || group === "all" ? null : group;
  const districtId = Number.isInteger(districtRaw) && districtRaw > 0 ? districtRaw : null;
  // Two years covers the corpus; anything longer is the same query with a
  // predicate that never bites.
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(Math.floor(daysRaw), 730) : null;

  try {
    const patterns = await computeTimePatterns(db, { crimeGroup, districtId, days });
    return Response.json({ ...patterns, scope: scope.districtName });
  } catch (e) {
    // Match the pendency route: a failed load should read as an empty screen
    // with its caveats intact, not as a broken one.
    console.error("patterns load failed:", e);
    return Response.json({ error: "Failed to load patterns" }, { status: 500 });
  }
}
