import { NextRequest } from "next/server";
import { randomBytes, pbkdf2Sync } from "crypto";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
}

export async function POST(req: NextRequest) {
  try {
    const { firstName, lastName, email, password } = await req.json();

    if (!firstName || !lastName || !email || !password) {
      return Response.json({ error: "All fields are required." }, { status: 400 });
    }
    if (password.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const existing = await prisma.khabriUser.findUnique({ where: { email } });
    if (existing) {
      return Response.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const salt = randomBytes(32).toString("hex");
    const passwordHash = hashPassword(password, salt);

    await prisma.khabriUser.create({
      data: { firstName, lastName, email, passwordHash, salt },
    });

    return Response.json({ success: true });
  } catch (e) {
    console.error("Signup error:", e);
    return Response.json({ error: "Signup failed. Please try again." }, { status: 500 });
  }
}
