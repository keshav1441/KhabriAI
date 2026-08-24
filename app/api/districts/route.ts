import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/chat-auth";

export const dynamic = "force-dynamic";

// Public: district names for the signup form (the names are public record).
export async function GET(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;
  const rows = await prisma.district.findMany({ select: { DistrictID: true, DistrictName: true }, orderBy: { DistrictName: "asc" } });
  return Response.json({ districts: rows.map((d) => ({ id: d.DistrictID, name: d.DistrictName })) }, { headers: { "cache-control": "public, max-age=3600" } });
}
