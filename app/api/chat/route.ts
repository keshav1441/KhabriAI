import { NextRequest } from "next/server";
import { runAgent } from "@/lib/agent/orchestrator";
import type { ChatTurn } from "@/lib/agent/tools";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { message, history = [] }: { message: string; history: ChatTurn[] } = await req.json();

  if (!message?.trim()) {
    return Response.json({ error: "Empty message" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runAgent(message, history, req)) {
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
