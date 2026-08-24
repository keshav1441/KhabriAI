import { NextRequest } from "next/server";
import { requireReviewer } from "@/lib/admin-auth";
import { listFeedback, reviewFeedback, type Vote } from "@/lib/feedback";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The review queue. Unreviewed first, newest first inside that. */
export async function GET(req: NextRequest) {
  const { denied } = await requireReviewer(req);
  if (denied) return denied;

  const q = req.nextUrl.searchParams;
  const status = q.get("status") ?? undefined;
  const vote = q.get("vote");

  try {
    const items = await listFeedback({
      status: status === "all" ? undefined : status ?? "new",
      vote: vote === "up" || vote === "down" ? (vote as Vote) : undefined,
    });
    return Response.json({
      items: items.map((f) => ({
        id: f.id,
        vote: f.vote,
        status: f.status,
        question: f.question,
        answer: f.answer,
        sql: f.sql,
        correctedSql: f.correctedSql,
        tools: f.tools,
        comment: f.comment,
        createdAt: f.createdAt,
        reviewedAt: f.reviewedAt,
        officer: `${f.user.firstName} ${f.user.lastName}`.trim() || f.user.email,
        role: f.user.role,
      })),
    });
  } catch (e) {
    console.error("feedback list failed:", e);
    return Response.json({ items: [] });
  }
}

/**
 * Accept a correction into the few-shot bank, or dismiss it. Approving runs the
 * SQL through the SELECT-only validator and executes it once, because an
 * example that does not run would teach the wrong shape to every question that
 * later retrieves it.
 */
export async function PATCH(req: NextRequest) {
  const { denied, reviewer } = await requireReviewer(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (typeof body?.id !== "string" || (body.action !== "approve" && body.action !== "reject")) {
    return Response.json({ error: "id and action ('approve' | 'reject') are required" }, { status: 400 });
  }

  const result = await reviewFeedback({
    id: body.id,
    action: body.action,
    correctedSql: typeof body.correctedSql === "string" ? body.correctedSql : null,
    reviewerId: reviewer.id,
  });

  return Response.json(result, { status: result.ok ? 200 : 400 });
}
