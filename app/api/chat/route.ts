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

  // Parsed inside the try: a malformed body is a bad request, and letting
  // req.json() throw here turned it into an opaque 500 rather than the 400
  // sitting three lines below.
  let body: { message?: string; history?: ChatTurn[]; lang?: "en" | "kn" };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Malformed request body" }, { status: 400 });
  }
  const { message, history = [], lang = "en" } = body;

  if (!message?.trim()) {
    return Response.json({ error: "Empty message" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // ponytail: a client disconnect (reload, navigation) closes the controller
      // mid-run, so every later enqueue throws. Swallow it once and stop writing
      // instead of crashing the route — and the error path can't re-throw either.
      let closed = false;
      const send = (event: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      try {
        for await (const event of runAgent(message, history, req, lang)) {
          send(event);
          if (closed) return;
        }
      } catch (e) {
        console.error("agent run failed:", e);
        // Only the error. The client merges whichever meta keys arrive, so
        // sending the full set here blanked a table the first `meta` had
        // already delivered — the officer lost evidence the run did produce.
        send({ type: "meta", sqlError: "Agent run failed" });
        send({ type: "token", token: "Something went wrong processing your request." });
        send({ type: "done" });
      } finally {
        // A failed enqueue used to skip the close entirely, so the response
        // never terminated and the composer stayed dead until a reload.
        try {
          controller.close();
        } catch {}
      }
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
