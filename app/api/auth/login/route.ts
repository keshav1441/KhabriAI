import { NextRequest } from "next/server";
import { pbkdf2Sync } from "crypto";
import { prisma } from "@/lib/db";

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

    return Response.json({
      success: true,
      user: { firstName: user.firstName, lastName: user.lastName, email: user.email },
    });
  } catch (e) {
    console.error("Login error:", e);
    return Response.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}
