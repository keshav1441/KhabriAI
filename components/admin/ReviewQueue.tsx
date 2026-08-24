"use client";
import { useState } from "react";

/**
 * The queue is where a thumbs-down turns into a few-shot example. Everything a
 * reviewer needs to judge the answer sits on the row — the question, what the
 * pipeline replied, which tools ran and the SQL it generated — because the
 * decision is "was this the right query", and that cannot be made from a vote.
 */

export interface FeedbackItem {
  id: string;
  vote: "up" | "down" | string;
  status: string;
  question: string;
  answer: string | null;
  sql: string | null;
  correctedSql: string | null;
  tools: string[];
  comment: string | null;
  createdAt: string;
  reviewedAt: string | null;
  officer: string;
  role: string;
}

export type ReviewOutcome = {
  ok: boolean;
  status?: string;
  learnedExampleId?: string;
  rowsReturned?: number;
  error?: string;
};

const fmtWhen = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";

const STATUS_TONE: Record<string, string> = {
  new: "var(--amber)",
  approved: "var(--green)",
  rejected: "var(--text-muted)",
};

export function ReviewQueue({
  items,
  loading,
  onReviewed,
}: {
  items: FeedbackItem[];
  loading: boolean;
  onReviewed: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg animate-pulse"
            style={{ height: 120, background: "var(--bg-raised)", animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div
        className="rounded-lg px-4 py-10 text-center"
        style={{ background: "var(--bg-surface)", border: "1px dashed var(--border)" }}
      >
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Nothing in this queue.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <ReviewRow key={item.id} item={item} onReviewed={onReviewed} />
      ))}
    </div>
  );
}

function ReviewRow({ item, onReviewed }: { item: FeedbackItem; onReviewed: () => void }) {
  const [draft, setDraft] = useState(item.sql ?? "");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);

  const isNew = item.status === "new";

  const submit = async (action: "approve" | "reject") => {
    setBusy(action);
    setOutcome(null);
    try {
      const res = await fetch("/api/admin/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, action, correctedSql: action === "approve" ? draft : undefined }),
      });
      const body: ReviewOutcome = await res
        .json()
        .catch(() => ({ ok: false, error: "The server returned nothing readable" }));
      setOutcome(body);
      // A refusal leaves the row open with its error showing: the validator's
      // message is the reviewer's next instruction, not a dead end.
      if (body.ok) onReviewed();
    } catch (e) {
      setOutcome({ ok: false, error: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      {/* Who rated it, when, and where it stands */}
      <div
        className="flex flex-wrap items-center gap-2 px-4 py-2.5"
        style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}
      >
        <span
          className="font-data text-[11px] font-bold px-2 py-0.5 rounded"
          style={
            item.vote === "up"
              ? { color: "var(--green)", background: "var(--green-dim)", border: "1px solid var(--green)" }
              : { color: "var(--red)", background: "var(--red-dim)", border: "1px solid var(--red)" }
          }
        >
          {item.vote === "up" ? "UP" : "DOWN"}
        </span>
        <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
          {item.officer}
        </span>
        <span className="font-data text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          {item.role}
        </span>
        <span className="font-data text-[11px] ml-auto" style={{ color: "var(--text-muted)" }}>
          {fmtWhen(item.createdAt)}
        </span>
        <span
          className="font-data text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
          style={{ color: STATUS_TONE[item.status] ?? "var(--text-muted)", border: "1px solid currentColor" }}
        >
          {item.status}
        </span>
      </div>

      <div className="px-4 py-3 space-y-3">
        <Field label="Question">
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>{item.question}</p>
        </Field>

        {item.answer && (
          <Field label="Answer given">
            <p
              className="text-xs whitespace-pre-wrap overflow-y-auto"
              style={{ color: "var(--text-secondary)", maxHeight: 160 }}
            >
              {item.answer}
            </p>
          </Field>
        )}

        {item.tools.length > 0 && (
          <Field label="Tools that ran">
            <div className="flex flex-wrap gap-1.5">
              {item.tools.map((tool) => (
                <span
                  key={tool}
                  className="font-data text-[11px] px-2 py-0.5 rounded"
                  style={{ background: "var(--khaki-dim)", border: "1px solid var(--khaki)", color: "var(--khaki)" }}
                >
                  {tool}
                </span>
              ))}
            </div>
          </Field>
        )}

        {item.comment && (
          <Field label="Comment from the officer">
            <p
              className="text-xs px-2.5 py-2 rounded whitespace-pre-wrap"
              style={{ color: "var(--text-primary)", background: "var(--amber-dim)", border: "1px solid var(--amber)" }}
            >
              {item.comment}
            </p>
          </Field>
        )}

        <Field label="Generated SQL">
          <SqlBlock sql={item.sql} />
        </Field>

        {isNew ? (
          <Field label="Corrected SQL — this becomes the few-shot example">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              rows={Math.min(14, Math.max(4, draft.split("\n").length + 1))}
              className="w-full font-data text-xs rounded-md px-2.5 py-2 outline-none resize-y"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                whiteSpace: "pre",
                overflowX: "auto",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--khaki)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            />
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <button
                onClick={() => submit("approve")}
                disabled={busy !== null}
                className="text-xs font-bold px-3 py-1.5 rounded-md transition-all disabled:opacity-50"
                style={{ color: "var(--green)", border: "1px solid var(--green)", background: "var(--green-dim)" }}
              >
                {busy === "approve" ? "Validating…" : "Approve"}
              </button>
              <button
                onClick={() => submit("reject")}
                disabled={busy !== null}
                className="text-xs font-bold px-3 py-1.5 rounded-md transition-all disabled:opacity-50"
                style={{ color: "var(--red)", border: "1px solid var(--red)", background: "var(--red-dim)" }}
              >
                {busy === "reject" ? "Rejecting…" : "Reject"}
              </button>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Approving runs the SQL once against the schema before it is stored.
              </span>
            </div>
          </Field>
        ) : (
          <>
            {item.correctedSql && (
              <Field label="Corrected SQL (read-only)">
                <SqlBlock sql={item.correctedSql} accent="var(--green)" />
              </Field>
            )}
            <p className="font-data text-[11px]" style={{ color: "var(--text-muted)" }}>
              {item.status} · {fmtWhen(item.reviewedAt)}
            </p>
          </>
        )}

        {outcome && (
          <p
            className="text-xs font-data px-2.5 py-2 rounded whitespace-pre-wrap"
            style={
              outcome.ok
                ? { color: "var(--green)", background: "var(--green-dim)", border: "1px solid var(--green)" }
                : { color: "var(--red)", background: "var(--red-dim)", border: "1px solid var(--red)" }
            }
          >
            {outcome.ok
              ? outcome.status === "approved"
                ? `Approved — the SQL returned ${outcome.rowsReturned ?? 0} row${outcome.rowsReturned === 1 ? "" : "s"} and is now a few-shot example${outcome.learnedExampleId ? ` · ${outcome.learnedExampleId}` : ""}.`
                : "Rejected — nothing was learned from it."
              : /* Verbatim: the validator's own words are what the reviewer acts on. */
                outcome.error}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="font-data text-[10px] font-bold uppercase tracking-widest mb-1"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

/** SQL scrolls inside its own box — one long line must never widen the page. */
function SqlBlock({ sql, accent }: { sql: string | null; accent?: string }) {
  if (!sql) {
    return (
      <p className="text-xs font-data" style={{ color: "var(--text-muted)" }}>
        No SQL — the answer did not query the database.
      </p>
    );
  }
  return (
    <pre
      className="font-data text-xs rounded-md px-2.5 py-2"
      style={{
        background: "var(--bg-input)",
        border: `1px solid ${accent ?? "var(--border)"}`,
        color: accent ?? "var(--text-secondary)",
        maxHeight: 200,
        overflow: "auto",
        whiteSpace: "pre",
      }}
    >
      {sql}
    </pre>
  );
}
