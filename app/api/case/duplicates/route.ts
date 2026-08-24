import { NextRequest } from "next/server";
import { findDuplicatesOf } from "@/lib/duplicate-detect";
import { requireUser, getScope } from "@/lib/chat-auth";

export const dynamic = "force-dynamic";

/**
 * Probable duplicate filings of one FIR — the same incident written up twice.
 * Runs in the caller's scope, so a district-posted officer is only ever shown
 * the half of a cross-district pair their posting lets them read.
 */
export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return Response.json({ error: "Invalid case ID" }, { status: 400 });
  const denied = await requireUser(req);
  if (denied) return denied;
  try {
    const { districtId } = await getScope(req);
    const candidates = await findDuplicatesOf(id, { districtId });
    return Response.json({
      duplicates: candidates.map(({ briefFacts, ...c }) => ({
        ...c,
        briefFacts: briefFacts?.slice(0, 220) ?? null,
      })),
    });
  } catch (e) {
    console.error("duplicate detection failed:", e);
    return Response.json({ duplicates: [] });
  }
}
