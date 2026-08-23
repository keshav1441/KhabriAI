import { NextRequest, NextResponse } from "next/server";
import { neonAuth, neonAuthConfigured, bridgeNeonUser } from "@/lib/neon-auth";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/session";

export const dynamic = "force-dynamic";

// After a Neon Auth sign-in (Google or email code) the browser holds a Neon
// session cookie. This turns it into the app's own session: find-or-create the
// KhabriUser and set khabri_session, exactly like the password login does.
export async function POST(req: NextRequest) {
  if (!neonAuthConfigured()) return Response.json({ error: "Neon Auth is not configured." }, { status: 501 });
  try {
    const result = (await neonAuth.getSession()) as { data?: { user?: { email?: string; name?: string | null } } | null };
    const identity = result?.data?.user;
    if (!identity?.email) return Response.json({ error: "No Neon Auth session." }, { status: 401 });

    const posting = await req.json().catch(() => ({})) as { role?: string; districtId?: number | null };
    const user = await bridgeNeonUser({ email: identity.email, name: identity.name }, posting);
    const res = NextResponse.json({ success: true, user });
    res.cookies.set(SESSION_COOKIE_NAME, createSessionToken(user.email), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return res;
  } catch (e) {
    console.error("neon auth bridge failed:", e);
    return Response.json({ error: "Sign-in could not be completed." }, { status: 500 });
  }
}
