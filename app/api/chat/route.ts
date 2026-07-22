import { NextRequest } from "next/server";
import { runAgent } from "@/lib/agent/orchestrator";
import type { ChatTurn } from "@/lib/agent/tools";
import { getUserFromRequest } from "@/lib/chat-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await getUserFromRequest(req);
  } catch (e) {
    // getUserFromRequest hits the DB; a stale Prisma client in a long-running
    // dev server throws here. Return a clean, diagnosable error instead of an
    // unhandled 500 — and restart the dev server (see README troubleshooting).
    console.error("auth lookup failed (restart dev server / run prisma generate):", e);
    return Response.json({ error: "Auth service unavailable — restart the dev server." }, { status: 503 });
  }
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { message, history = [], lang = "en" }: { message: string; history: ChatTurn[]; lang?: "en" | "kn" } =
    await req.json();

  if (!message?.trim()) {
    return Response.json({ error: "Empty message" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runAgent(message, history, req, lang)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } catch (e) {
        console.error("agent run failed:", e);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "meta", sql: "", rows: [], vizType: "table", sqlError: "Agent run failed", relatedCases: [] })}\n\n`
          )
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "token", token: "Something went wrong processing your request." })}\n\n`
          )
        );
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
