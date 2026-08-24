import { NextRequest } from "next/server";
import { requireUser, getScope } from "@/lib/chat-auth";
import { findSamePerson, IDENT } from "@/lib/identity-resolve";

export const dynamic = "force-dynamic";

/**
 * Records that look like the same human as the given one.
 *
 * `?accusedId=` is the honest entry point — one row from one FIR, matched on
 * what the register actually holds. `?personId=` is a convenience for the views
 * that still carry a PersonID: it only picks the seed ROW, and that row is then
 * matched on its own name, age and gender like any unlabelled record would be.
 *
 * Nothing is merged and nothing is written. The response is a ranked list with
 * the signals that fired, for an officer to judge.
 */
export async function GET(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;

  const q = req.nextUrl.searchParams;
  const personId = q.get("personId");
  const accusedId = Number(q.get("accusedId")) || null;
  if (!personId && !accusedId) {
    return Response.json({ error: "Pass accusedId or personId" }, { status: 400 });
  }

  try {
    const { districtId } = await getScope(req);
    // Near misses are worth seeing by hand, so the caller may lower the bar —
    // never raise it silently.
    const min = Number(q.get("min"));
    const result = await findSamePerson(
      { accusedId, personId },
      { districtId, minConfidence: Number.isFinite(min) && min > 0 ? min : IDENT.threshold }
    );
    if (!result) {
      return Response.json({ error: "No such accused record in scope" }, { status: 404 });
    }
    return Response.json({
      seed: result.seed,
      candidates: result.candidates,
      considered: result.considered,
      threshold: IDENT.threshold,
    });
  } catch (e) {
    console.error("identity resolution failed:", e);
    return Response.json({ error: "Failed to resolve identity" }, { status: 500 });
  }
}
