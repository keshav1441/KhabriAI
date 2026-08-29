"use client";
import { useState, type ReactNode } from "react";
import { StreamingText } from "./StreamingText";
import { ResultsTable } from "../viz/ResultsTable";
import { CrimeChart } from "../viz/CrimeChart";
import { NetworkGraph } from "../viz/NetworkGraph";
import { RelatedCases } from "./RelatedCases";
import { useChatStore, type ChatMessage } from "@/store/chat";
import { chatHeaders } from "@/lib/chat-api";
import { t, speechLocale } from "@/lib/i18n";

// ponytail: native SpeechSynthesis TTS; no cloud voice.
function speak(text: string, locale: string) {
  if (!("speechSynthesis" in window) || !text.trim()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = locale;
  const match = window.speechSynthesis.getVoices().find((v) => v.lang === locale);
  if (match) u.voice = match;
  window.speechSynthesis.speak(u);
}

function exportCSV(rows: Record<string, unknown>[], filename = "khabri-export.csv") {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(","), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  // Firefox ignores a click on an anchor that was never in the document, and
  // revoking the object URL in the same tick races the download in Safari.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The answer's own question, read back out of the transcript: feedback is only
 * useful paired with what was asked, and the API rejects an empty question.
 */
function useQuestionFor(messageId: string): string | null {
  return useChatStore((s) => {
    const idx = s.messages.findIndex((m) => m.id === messageId);
    for (let i = idx - 1; i >= 0; i--) {
      if (s.messages[i].role === "user") return s.messages[i].content;
    }
    return null;
  });
}

function AnswerFeedback({ message }: { message: ChatMessage }) {
  const lang = useChatStore((s) => s.lang);
  const sessionId = useChatStore((s) => s.activeSessionId);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const question = useQuestionFor(message.id);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState("");
  const [failed, setFailed] = useState(false);

  // History that lost its question would post something the API refuses, so
  // show nothing rather than a button that cannot work.
  if (!question) return null;

  const vote = message.feedback;

  const post = async (next: "up" | "down", note?: string) => {
    const previous = vote;
    // Optimistic: the verdict lands in the transcript before the network does,
    // and quietly rolls back if the post fails. Never blocks the chat.
    updateMessage(message.id, { feedback: next });
    setCommenting(false);
    setComment("");
    setFailed(false);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: chatHeaders(),
        body: JSON.stringify({
          vote: next,
          question,
          answer: message.content,
          sql: message.sql,
          tools: message.tools ?? [],
          messageId: message.id,
          sessionId,
          comment: note?.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("rejected");
    } catch {
      updateMessage(message.id, { feedback: previous });
      setFailed(true);
    }
  };

  const btn = (active: boolean, accent: string) => ({
    color: active ? accent : "var(--text-muted)",
    borderColor: active ? accent : "var(--border)",
  });

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <button
          onClick={() => post("up")}
          title={t("feedback.up", lang)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-data transition-colors"
          style={{ border: "1px solid", ...btn(vote === "up", "var(--green)") }}
        >
          👍 {t("feedback.up", lang)}
        </button>
        <button
          onClick={() => setCommenting((c) => !c)}
          title={t("feedback.down", lang)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-data transition-colors"
          style={{ border: "1px solid", ...btn(vote === "down", "var(--red)") }}
        >
          👎 {t("feedback.down", lang)}
        </button>
        {vote && !commenting && (
          <span className="text-xs font-data" style={{ color: "var(--text-muted)" }}>
            {t("feedback.recorded", lang)}
          </span>
        )}
        {failed && (
          <span className="text-xs font-data" style={{ color: "var(--red)" }}>
            {t("feedback.failed", lang)}
          </span>
        )}
      </div>

      {commenting && (
        <div className="space-y-1.5 max-w-md">
          <textarea
            rows={2}
            autoFocus
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("feedback.prompt", lang)}
            className="block w-full resize-none rounded px-2 py-1.5 text-xs outline-none"
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => post("down", comment)}
              className="px-2 py-0.5 rounded text-xs font-data text-white"
              style={{ background: "var(--red)" }}
            >
              {t("feedback.send", lang)}
            </button>
            <button
              onClick={() => post("down")}
              className="px-2 py-0.5 rounded text-xs font-data"
              style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
            >
              {t("feedback.skip", lang)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The groundedness marker. Deliberately lopsided: a clean answer gets one muted
 * line an officer can skip, an unverified figure gets a red badge that names the
 * figure - that is the case someone has to look at before it reaches a briefing.
 */
function GroundednessMark({ message }: { message: ChatMessage }) {
  const lang = useChatStore((s) => s.lang);
  const verdict = message.groundedness;
  // Nothing to say about an answer that quoted no figures at all.
  if (!verdict || verdict.checked === 0) return null;

  if (verdict.grounded) {
    return (
      <div
        className="flex items-center gap-1 text-xs font-data"
        style={{ color: "var(--text-muted)" }}
        title={t("answer.groundedTip", lang)}
      >
        <span aria-hidden>✓</span>
        {t("answer.grounded", lang)}
      </div>
    );
  }

  const unverified = verdict.claims.filter((c) => !c.supported).map((c) => c.text);
  return (
    <div
      className="inline-flex items-start gap-1.5 px-2 py-1 rounded text-xs font-data"
      style={{ background: "var(--red-dim)", border: "1px solid var(--red)", color: "var(--red)" }}
      title={t("answer.ungroundedTip", lang)}
    >
      <span aria-hidden>⚠</span>
      <span>
        {t("answer.ungrounded", lang)}
        {unverified.length > 0 && <>: {unverified.join(", ")}</>}
      </span>
    </div>
  );
}

/**
 * The working behind an answer. Collapsed by default and off the SQL-free
 * default view on purpose: the officer who never asks "how do I know this?"
 * should not have to read a query, and the one who does should not have to ask
 * anyone. Nothing here is recomputed - it is the run's own evidence, replayed.
 */
function TracePanel({ message }: { message: ChatMessage }) {
  const lang = useChatStore((s) => s.lang);
  const [open, setOpen] = useState(false);
  const trace = message.trace;
  if (!trace) return null;

  const row = (label: string, body: ReactNode) => (
    <div className="space-y-1">
      <p className="text-[10px] font-data font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      {body}
    </div>
  );

  const verdict = trace.groundedness ?? message.groundedness;

  return (
    <div className="space-y-1.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-xs font-data transition-colors"
        style={{ color: "var(--text-muted)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--ink)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
        aria-expanded={open}
      >
        <span aria-hidden style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms ease" }}>
          ▸
        </span>
        {t(open ? "trace.hide" : "trace.show", lang)}
      </button>

      {open && (
        <div
          className="rounded-md px-3 py-2.5 space-y-3"
          style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}
        >
          <p className="text-xs font-data font-bold" style={{ color: "var(--text-primary)" }}>
            {t("trace.title", lang)}
          </p>

          {row(
            t("trace.tools", lang),
            <ul className="space-y-0.5">
              {trace.tools.map((tool, i) => (
                <li key={i} className="text-xs font-data" style={{ color: "var(--text-secondary)" }}>
                  <span style={{ color: tool.status === "error" ? "var(--red)" : "var(--green)" }} aria-hidden>
                    {tool.status === "error" ? "✕" : "✓"}
                  </span>{" "}
                  {tool.tool} · {tool.durationMs} ms
                  {tool.error && <span style={{ color: "var(--red)" }}> · {tool.error}</span>}
                </li>
              ))}
            </ul>
          )}

          {trace.sql &&
            row(
              t("trace.sql", lang),
              <>
                {/* min-w-0 + overflow-x on the block itself: a wide query scrolls
                    inside its own box instead of stretching the transcript. */}
                <pre
                  className="text-xs font-data rounded px-2 py-1.5 overflow-x-auto max-h-56 overflow-y-auto"
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)", maxWidth: "100%" }}
                >
                  {trace.sql}
                </pre>
                <p className="text-xs font-data" style={{ color: "var(--text-muted)" }}>
                  {trace.rowCount} {t("trace.rows", lang)}
                </p>
                {trace.repaired && (
                  <p className="text-xs font-data" style={{ color: "var(--amber)" }}>
                    ⚠ {t("trace.repaired", lang)}
                    {trace.repairError && <span style={{ color: "var(--text-muted)" }}> · {trace.repairError}</span>}
                  </p>
                )}
                {trace.substitutions.length > 0 && (
                  <p className="text-xs font-data" style={{ color: "var(--text-secondary)" }}>
                    {trace.substitutions.map((sub) => `${sub.from} → ${sub.to}`).join(", ")}
                  </p>
                )}
              </>
            )}

          {trace.examples.length > 0 &&
            row(
              t("trace.examples", lang),
              <ul className="space-y-0.5">
                {trace.examples.map((ex, i) => (
                  <li key={i} className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {ex.question}
                    <span className="font-data" style={{ color: "var(--text-muted)" }}> · {Math.round(ex.score * 100)}%</span>
                  </li>
                ))}
              </ul>
            )}

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {row(
              t("trace.scope", lang),
              <p className="text-xs font-data" style={{ color: "var(--text-secondary)" }}>
                {trace.scope.districtName ?? t("header.statewide", lang)}
              </p>
            )}
            {row(
              t("trace.timing", lang),
              <p className="text-xs font-data" style={{ color: "var(--text-secondary)" }}>
                {(trace.totalMs / 1000).toFixed(1)} s
              </p>
            )}
          </div>

          {verdict && verdict.checked > 0 && (
            <p className="text-xs font-data" style={{ color: verdict.grounded ? "var(--text-muted)" : "var(--red)" }}>
              {verdict.grounded ? `✓ ${t("answer.grounded", lang)}` : `⚠ ${t("answer.ungrounded", lang)}`}
              {" "}({verdict.checked})
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const lang = useChatStore((s) => s.lang);
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[78%] px-4 py-2.5 text-sm rounded-md rounded-tr-none"
          style={{
            background: "var(--ink)",
            color: "#fff",
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  const hasData = message.rows && message.rows.length > 0;

  return (
    <div className="flex justify-start gap-3">
      {/* Avatar */}
      <div
        className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center mt-0.5"
        style={{ background: "var(--red-dim)", border: "1px solid var(--red)" }}
      >
        <svg width="14" height="16" viewBox="0 0 32 36" fill="none">
          <path d="M16 1L2 7v10c0 8.5 5.9 16.5 14 18.5C24.1 33.5 30 25.5 30 17V7L16 1z" stroke="var(--red)" strokeWidth="2" />
          <path d="M11 18l3 3 7-7" stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="flex-1 min-w-0 max-w-[90%] space-y-2">
        {/* Narrative */}
        <div
          className="px-4 py-3 rounded-md rounded-tl-none text-sm leading-relaxed"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderLeftColor: "var(--ink)",
            borderLeftWidth: "3px",
            color: "var(--text-primary)",
          }}
        >
          <StreamingText text={message.content} loading={message.loading} />
          {message.sqlError && !message.loading && (
            <p className="text-xs mt-2 font-data" style={{ color: "var(--red)" }}>
              ⚠ {message.sqlError}
            </p>
          )}
          {!message.loading && message.content && (
            <button
              onClick={() => speak(message.content.replace(/\*\*/g, ""), speechLocale(lang))}
              title={t("chat.readAloud", lang)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-data transition-colors"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--ink)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" />
              </svg>
              Listen
            </button>
          )}
        </div>

        {!message.loading && message.content && <GroundednessMark message={message} />}

        {!message.loading && message.content && <TracePanel message={message} />}

        {!message.loading && message.content && <AnswerFeedback message={message} />}

        {!message.loading && <RelatedCases cases={message.relatedCases} />}

        {/* Data visualization */}
        {!message.loading && hasData && (
          <div className="space-y-2">
            <div
              className="rounded-md overflow-hidden"
              style={{ border: "1px solid var(--border)" }}
            >
              {message.vizType === "chart" && <CrimeChart rows={message.rows!} />}
              {message.vizType === "graph" && <NetworkGraph rows={message.rows!} />}
              {(!message.vizType || message.vizType === "table") && (
                <ResultsTable rows={message.rows!} />
              )}
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-4">
              <span className="text-xs font-data" style={{ color: "var(--text-muted)" }}>
                {message.rows!.length} rows
              </span>
              <button
                onClick={() => exportCSV(message.rows!)}
                className="text-xs font-medium transition-colors font-data"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--blue)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
              >
                ↓ Export CSV
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
