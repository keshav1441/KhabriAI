import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function getUserFromRequest(req: NextRequest) {
  const email = req.headers.get("X-User-Email")?.trim();
  if (!email) return null;
  return prisma.khabriUser.findUnique({ where: { email } });
}
