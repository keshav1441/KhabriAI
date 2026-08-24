import { NextRequest } from "next/server";
import { requireUser, getScope } from "@/lib/chat-auth";
import { suggestSections } from "@/lib/section-suggest";

export const dynamic = "force-dynamic";

const MIN_FACTS = 20;
const MAX_FACTS = 4000;

const optId = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;

/**
 * Sections the past filings suggest for these facts. Read-only and evidential:
 * every suggestion comes back with the neighbour count and the CrimeNos behind
 * it, because a confidence number the officer cannot audit is worth nothing.
 * Scoped like every other data route — a district-posted officer's suggestions
 * are argued only from the files RLS lets them read.
 */
export async function POST(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const briefFacts = typeof b.briefFacts === "string" ? b.briefFacts.trim() : "";
  if (briefFacts.length < MIN_FACTS) return Response.json({ error: `briefFacts must be at least ${MIN_FACTS} characters` }, { status: 400 });
  if (briefFacts.length > MAX_FACTS) return Response.json({ error: `briefFacts is limited to ${MAX_FACTS} characters` }, { status: 400 });

  try {
    const scope = await getScope(req);
    const { suggestions, basedOnCases } = await suggestSections(briefFacts, {
      crimeMajorHeadId: optId(b.crimeMajorHeadId),
      crimeMinorHeadId: optId(b.crimeMinorHeadId),
      districtId: scope.districtId,
    });
    return Response.json({ suggestions, basedOnCases });
  } catch (e) {
    console.error("section suggest failed:", e);
    return Response.json({ error: "Could not read the facts" }, { status: 503 });
  }
}
