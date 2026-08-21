import { NextRequest } from "next/server";
import { requireUser } from "@/lib/chat-auth";
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
    return Response.json(await createCase(v.value), { status: 201 });
  } catch (e) {
    if (e instanceof FirError) return Response.json({ error: e.message }, { status: e.status });
    console.error("create case error:", e);
    return Response.json({ error: "Failed to register case" }, { status: 500 });
  }
}
