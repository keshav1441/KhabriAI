"use client";
import { StreamingText } from "./StreamingText";
import { ResultsTable } from "../viz/ResultsTable";
import { CrimeChart } from "../viz/CrimeChart";
import { NetworkGraph } from "../viz/NetworkGraph";
import { RelatedCases } from "./RelatedCases";
import { useChatStore, type ChatMessage } from "@/store/chat";
import { speechLocale } from "@/lib/i18n";

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
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
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
              onClick={() => speak(message.content, speechLocale(lang))}
              title="Read aloud"
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

        {!message.loading && message.sql && (
          <details className="rounded-md overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <summary
              className="cursor-pointer select-none px-3 py-1.5 text-xs font-data"
              style={{ color: "var(--text-muted)", background: "var(--bg-surface)" }}
            >
              ▸ How I got this — generated SQL
            </summary>
            <pre
              className="px-3 py-2 text-xs overflow-x-auto font-data"
              style={{ color: "var(--green)", background: "var(--bg-raised)", margin: 0 }}
            >
              {message.sql}
            </pre>
          </details>
        )}

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
