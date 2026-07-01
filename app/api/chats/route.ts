import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromRequest } from "@/lib/chat-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const sessions = await prisma.chatSession.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true, createdAt: true },
    });

    return Response.json({ sessions });
  } catch (e) {
    console.error("GET /api/chats:", e);
    return Response.json({ error: "Failed to load chats" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const session = await prisma.chatSession.create({
      data: { userId: user.id },
      select: { id: true, title: true, updatedAt: true, createdAt: true },
    });

    return Response.json({ session });
  } catch (e) {
    console.error("POST /api/chats:", e);
    return Response.json({ error: "Failed to create chat" }, { status: 500 });
  }
}
