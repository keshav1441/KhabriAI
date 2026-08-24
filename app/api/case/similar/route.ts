import { NextRequest } from "next/server";
import { similarCasesTo } from "@/lib/case-retrieval";
import { requireUser, getScope } from "@/lib/chat-auth";

export const dynamic = "force-dynamic";

// Modus-operandi links for one case: the nearest narratives by embedding.
export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return Response.json({ error: "Invalid case ID" }, { status: 400 });
  const denied = await requireUser(req);
  if (denied) return denied;
  try {
    const { districtId } = await getScope(req);
    const cases = await similarCasesTo(id, { topK: 5, minScore: 0.5, districtId });
    return Response.json({ cases: cases.map(({ briefFacts, ...c }) => ({ ...c, briefFacts: briefFacts?.slice(0, 220) ?? null })) });
  } catch (e) {
    console.error("similar cases failed:", e);
    return Response.json({ cases: [] });
  }
}
