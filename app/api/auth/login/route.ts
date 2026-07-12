import { NextRequest, NextResponse } from "next/server";
import { pbkdf2Sync } from "crypto";
import { prisma } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/session";

export const dynamic = "force-dynamic";

function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return Response.json({ error: "Email and password are required." }, { status: 400 });
    }

    const user = await prisma.khabriUser.findUnique({ where: { email } });
    if (!user) {
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const hash = hashPassword(password, user.salt);
    if (hash !== user.passwordHash) {
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const res = NextResponse.json({
      success: true,
      user: { firstName: user.firstName, lastName: user.lastName, email: user.email },
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
    console.error("Login error:", e);
    return Response.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}
