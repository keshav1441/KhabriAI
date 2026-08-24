import { NextRequest } from "next/server";
import { requireUser, scopedDb } from "@/lib/chat-auth";
import { findRepeatVictims } from "@/lib/victims";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/victims?minCases=2&limit=100
 *
 * The repeat-victimisation list runs entirely inside scopedDb, so a
 * district-posted officer sees their district's repeat victims and the
 * distribution computed over their district's files — the RLS policies do the
 * cutting, not a WHERE clause this route could forget to write.
 *
 * Names of victims are PII, so the session guard is not optional here.
 */
export async function GET(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;
  const { db, scope } = await scopedDb(req);

  const { searchParams } = new URL(req.url);
  const minCases = Math.min(Math.max(Number(searchParams.get("minCases")) || 2, 2), 20);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 100, 1), 500);

  try {
    const report = await findRepeatVictims(db, { minCases, limit });
    return Response.json({ ...report, minCases, scope: scope.districtName });
  } catch (e) {
    // A screen about people who may need protection should degrade to "nothing
    // found", never to a broken page that hides the caveat with it.
    console.error("repeat victim scan failed:", e);
    return Response.json({
      clusters: [],
      distribution: {
        victimRecords: 0, cases: 0, people: 0, repeatPeople: 0, repeatShare: 0,
        repeatCases: 0, repeatCaseShare: 0, maxCases: 0,
      },
      generatedAt: new Date().toISOString(),
      truncated: false,
      minCases,
      scope: scope.districtName,
    });
  }
}
