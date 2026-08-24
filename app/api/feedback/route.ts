import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/chat-auth";
import { recordFeedback, type Vote } from "@/lib/feedback";

export const dynamic = "force-dynamic";

/**
 * An officer's verdict on one answer, with the exchange attached. The client
 * sends the question, the SQL and the tool names because it holds them: chat
 * messages are re-keyed when they are persisted, so the id in the browser is
 * not a database id.
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const vote = body?.vote;
  if (vote !== "up" && vote !== "down") {
    return Response.json({ error: "vote must be 'up' or 'down'" }, { status: 400 });
  }
  if (typeof body?.question !== "string" || !body.question.trim()) {
    return Response.json({ error: "question is required" }, { status: 400 });
  }

  try {
    const row = await recordFeedback({
      userId: user.id,
      vote: vote as Vote,
      messageId: typeof body.messageId === "string" ? body.messageId : null,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
      question: body.question,
      answer: typeof body.answer === "string" ? body.answer : null,
      sql: typeof body.sql === "string" ? body.sql : null,
      tools: Array.isArray(body.tools) ? body.tools : [],
      comment: typeof body.comment === "string" ? body.comment : null,
    });
    return Response.json({ ok: true, id: row.id, vote: row.vote });
  } catch (e) {
    console.error("feedback capture failed:", e);
    return Response.json({ error: "Could not record that" }, { status: 500 });
  }
}
