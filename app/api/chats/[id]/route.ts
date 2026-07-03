import { NextRequest } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getUserFromRequest } from "@/lib/chat-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function getOwnedSession(userId: number, sessionId: string) {
  return prisma.chatSession.findFirst({
    where: { id: sessionId, userId },
  });
}

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const session = await prisma.chatSession.findFirst({
    where: { id, userId: user.id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!session) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({
    session: {
      id: session.id,
      title: session.title,
      updatedAt: session.updatedAt,
      messages: session.messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        sql: m.sql ?? undefined,
        rows: m.rows as Record<string, unknown>[] | undefined,
        vizType: m.vizType as "table" | "chart" | "graph" | undefined,
        sqlError: m.sqlError,
        relatedCases: m.relatedCases as Record<string, unknown>[] | undefined,
      })),
    },
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const owned = await getOwnedSession(user.id, id);
  if (!owned) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { title, messages } = body as {
    title?: string;
    messages?: Array<{
      role: string;
      content: string;
      sql?: string;
      rows?: Record<string, unknown>[];
      vizType?: string;
      sqlError?: string | null;
      relatedCases?: Record<string, unknown>[];
    }>;
  };

  if (messages?.length) {
    await prisma.chatMessage.createMany({
      data: messages.map((m) => ({
        sessionId: id,
        role: m.role,
        content: m.content,
        sql: m.sql ?? null,
        rows: m.rows != null ? (m.rows as Prisma.InputJsonValue) : undefined,
        vizType: m.vizType ?? null,
        sqlError: m.sqlError ?? null,
        relatedCases: m.relatedCases != null ? (m.relatedCases as Prisma.InputJsonValue) : undefined,
      })),
    });
  }

  const session = await prisma.chatSession.update({
    where: { id },
    data: {
      ...(title ? { title } : {}),
      updatedAt: new Date(),
    },
    select: { id: true, title: true, updatedAt: true, createdAt: true },
  });

  return Response.json({ session });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const owned = await getOwnedSession(user.id, id);
  if (!owned) return Response.json({ error: "Not found" }, { status: 404 });

  await prisma.chatSession.delete({ where: { id } });
  return Response.json({ success: true });
}
