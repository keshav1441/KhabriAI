"use client";
import { useState } from "react";
import { StreamingText } from "./StreamingText";
import { ResultsTable } from "../viz/ResultsTable";
import { CrimeChart } from "../viz/CrimeChart";
import { NetworkGraph } from "../viz/NetworkGraph";
import type { ChatMessage } from "@/store/chat";

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
  const [showSQL, setShowSQL] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[78%] px-4 py-2.5 text-sm rounded-md rounded-tr-none"
          style={{
            background: "var(--red)",
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
            color: "var(--text-primary)",
          }}
        >
          <StreamingText text={message.content} loading={message.loading} />
          {message.sqlError && !message.loading && (
            <p className="text-xs mt-2 font-data" style={{ color: "var(--red)" }}>
              ⚠ {message.sqlError}
            </p>
          )}
        </div>

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
              <button
                onClick={() => setShowSQL((v) => !v)}
                className="text-xs font-medium transition-colors font-data"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--red)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
              >
                {showSQL ? "▾" : "▸"} SQL · {message.rows!.length} rows
              </button>
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

            {showSQL && (
              <pre
                className="text-xs p-3 rounded-md overflow-x-auto font-data"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  color: "var(--green)",
                  lineHeight: 1.6,
                }}
              >
                {message.sql}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
