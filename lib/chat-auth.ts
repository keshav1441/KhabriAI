import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/session";

export async function getUserFromRequest(req: NextRequest) {
  const session = verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  return prisma.khabriUser.findUnique({ where: { email: session.email } });
}

/**
 * Guard for data endpoints. Returns a Response to short-circuit with (401/503)
 * or null when the request is authenticated. Keeps PII behind the session
 * cookie, matching the /api/chat guard.
 */
export async function requireUser(req: NextRequest): Promise<Response | null> {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return null;
  } catch (e) {
    console.error("auth lookup failed (restart dev server / run prisma generate):", e);
    return Response.json({ error: "Auth service unavailable" }, { status: 503 });
  }
}
