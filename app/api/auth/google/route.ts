import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

async function districtNameOf(id: number | null): Promise<string | null> {
  if (!id) return null;
  const d = await prisma.district.findUnique({ where: { DistrictID: id } });
  return d?.DistrictName ?? null;
}
import { verifyGoogleIdToken } from "@/lib/google-auth";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return Response.json({ error: "Google sign-in is not configured." }, { status: 501 });
    }
    const { credential } = await req.json();
    if (typeof credential !== "string" || !credential) {
      return Response.json({ error: "Missing Google credential." }, { status: 400 });
    }

    const identity = await verifyGoogleIdToken(credential, clientId);
    if (!identity) {
      return Response.json({ error: "Google sign-in could not be verified." }, { status: 401 });
    }

    // Find-or-create by email; Google-only users have no password (passwordHash/salt null).
    const user = await prisma.khabriUser.upsert({
      where: { email: identity.email },
      update: {},
      create: { email: identity.email, firstName: identity.firstName, lastName: identity.lastName },
    });

    const res = NextResponse.json({
      success: true,
      user: { firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role, districtName: await districtNameOf(user.districtId) },
    });
    res.cookies.set(SESSION_COOKIE_NAME, createSessionToken(user.email), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return res;
  } catch (e) {
    console.error("Google login error:", e);
    return Response.json({ error: "Google sign-in failed. Please try again." }, { status: 500 });
  }
}
