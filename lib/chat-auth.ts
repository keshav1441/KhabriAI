import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/session";

export async function getUserFromRequest(req: NextRequest) {
  const session = verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  return prisma.khabriUser.findUnique({ where: { email: session.email } });
}
