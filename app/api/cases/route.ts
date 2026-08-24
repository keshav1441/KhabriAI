import { NextRequest } from "next/server";
import { requireUser, getScope } from "@/lib/chat-auth";
import { prisma } from "@/lib/db";
import { validateFirInput } from "@/lib/fir";
import { createCase, FirError } from "@/lib/fir-create";

export const dynamic = "force-dynamic";

// Register a new FIR. Validation is the trust boundary; the insert is one transaction.
export async function POST(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const v = validateFirInput(body);
  if (!v.ok) return Response.json({ error: v.errors[0], errors: v.errors }, { status: 400 });
  try {
    // The insert runs as the owner, so row-level security never sees it. Without
    // this check a district-posted officer could register an FIR at a station in
    // another district - and then not be able to see the case they just created.
    const { districtId } = await getScope(req);
    if (districtId) {
      const unit = await prisma.unit.findUnique({
        where: { UnitID: v.value.policeStationId },
        select: { DistrictID: true },
      });
      if (unit?.DistrictID !== districtId) {
        return Response.json({ error: "That police station is outside your posting" }, { status: 403 });
      }
    }

    return Response.json(await createCase(v.value), { status: 201 });
  } catch (e) {
    if (e instanceof FirError) return Response.json({ error: e.message }, { status: e.status });
    console.error("create case error:", e);
    return Response.json({ error: "Failed to register case" }, { status: 500 });
  }
}
