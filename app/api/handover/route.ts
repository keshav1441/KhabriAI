import { NextRequest } from "next/server";
import { requireUser, getScope } from "@/lib/chat-auth";
import { buildHandover } from "@/lib/handover";

export const dynamic = "force-dynamic";
// The brief fans out to the crew walk and two vector searches; the crew route
// already allows itself a minute for the same reason.
export const maxDuration = 60;

/**
 * The handover brief for one case. Session-guarded and scoped: the brief is
 * assembled from the files the caller's posting lets them read, so a
 * district-posted officer never hands over another district's case.
 */
export async function GET(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;

  const raw = req.nextUrl.searchParams.get("caseId");
  const caseId = Number(raw);
  if (!raw || !Number.isInteger(caseId) || caseId <= 0) {
    return Response.json({ error: "Pass a numeric caseId" }, { status: 400 });
  }

  try {
    const { districtId } = await getScope(req);
    const brief = await buildHandover(caseId, { districtId });
    // Out of scope and not existing are the same 404 on purpose — a different
    // answer for each would confirm the existence of a file the officer may not see.
    if (!brief) return Response.json({ error: "Case not found" }, { status: 404 });
    return Response.json({ brief });
  } catch (e) {
    console.error("handover brief failed:", e);
    return Response.json({ error: "Failed to assemble the handover brief" }, { status: 500 });
  }
}
