import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/chat-auth";
import { listAlerts, markRead } from "@/lib/alerts";

export const dynamic = "force-dynamic";

/** The officer's alert feed: unread first, newest first, plus the counts the bell badge needs. */
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { alerts, unread, last24h } = await listAlerts(user.id);
    return Response.json({ alerts, unread, last24h });
  } catch (e) {
    console.error("alerts list failed:", e);
    return Response.json({ alerts: [], unread: 0, last24h: 0 });
  }
}

/** Mark alerts read — a list of ids, or every unread one when `ids` is omitted. */
export async function PATCH(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? body.ids.filter((i: unknown) => typeof i === "string") : undefined;
  const count = await markRead(user.id, ids);
  return Response.json({ ok: true, count });
}
