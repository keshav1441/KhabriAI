"use client";
// ponytail: browser print-to-PDF over jsPDF/html2canvas — a print-only transcript
// + window.print(). Add a PDF lib only if a pixel-perfect branded export is required.
import { useChatStore } from "@/store/chat";

export function ConversationExport() {
  const messages = useChatStore((s) => s.messages);
  const disabled = messages.length === 0;

  return (
    <>
      <button
        onClick={() => window.print()}
        disabled={disabled}
        className="text-xs font-medium px-3 py-1.5 rounded-md transition-all disabled:opacity-40"
        style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
        onMouseEnter={(e) => { if (!disabled) { (e.currentTarget as HTMLElement).style.color = "var(--ink)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--ink)"; } }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
        title="Export conversation as PDF"
      >
        ↓ PDF
      </button>

      {/* Print-only transcript — hidden on screen, revealed by @media print in globals.css */}
      <div className="print-root">
        <div className="print-header">
          <strong>KHABRI AI</strong> · KSP Intelligence — Conversation Transcript
        </div>
        {messages.map((m) => (
          <div key={m.id} className={`print-msg print-${m.role}`}>
            <div className="print-role">{m.role === "user" ? "INVESTIGATOR" : "KHABRI AI"}</div>
            <div className="print-content">{m.content}</div>
            {m.sql ? <pre className="print-sql">{m.sql}</pre> : null}
            {m.rows && m.rows.length > 0 ? <PrintTable rows={m.rows} /> : null}
          </div>
        ))}
      </div>
    </>
  );
}

function PrintTable({ rows }: { rows: Record<string, unknown>[] }) {
  const cols = Object.keys(rows[0]);
  const shown = rows.slice(0, 100); // ponytail: cap printed rows; full data is in CSV export
  return (
    <table className="print-table">
      <thead>
        <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {shown.map((r, i) => (
          <tr key={i}>{cols.map((c) => <td key={c}>{String(r[c] ?? "")}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
