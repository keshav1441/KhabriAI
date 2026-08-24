"use client";
import { useState } from "react";
// Type-only — lib/audit.ts reaches for the server Prisma client, so this import
// must never survive into the browser bundle.
import type { AuditRun, AuditStep } from "@/lib/audit";

/**
 * The trail, as a reviewer reads it: one row per question, its tool calls
 * folded away until asked for. The row carries the accountability facts — who
 * asked, and what they were allowed to see when they asked — so a scan of the
 * collapsed list is already a review; expanding is for the "why did that
 * return nothing" case.
 */

// Dates survive the API as ISO strings, so the wire shape is not quite AuditRun.
export type AuditStepRow = Omit<AuditStep, "createdAt"> & { createdAt: string };
export type AuditRunRow = Omit<AuditRun, "createdAt" | "steps"> & {
  createdAt: string;
  steps: AuditStepRow[];
};

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export const fmtMs = (ms: number | null) =>
  ms == null ? "—" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;

export function AuditRunList({ runs, loading }: { runs: AuditRunRow[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg animate-pulse"
            style={{ height: 74, background: "var(--bg-raised)", animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    );
  }

  if (!runs.length) {
    return (
      <div
        className="rounded-lg px-4 py-10 text-center"
        style={{ background: "var(--bg-surface)", border: "1px dashed var(--border)" }}
      >
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No runs in the trail for these filters.
        </p>
        <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
          Widen the window or clear a filter — nothing was recorded, rather than nothing being shown.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <RunRow key={run.runId} run={run} />
      ))}
    </div>
  );
}

/**
 * A district-bound query and a statewide one are the same row otherwise, so the
 * scope badge is the one place the difference has to be unmissable.
 */
export function ScopeBadge({ scope }: { scope: string }) {
  const statewide = scope === "Statewide";
  return (
    <span
      className="font-data text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0"
      style={
        statewide
          ? { color: "var(--blue)", background: "var(--blue-dim)", border: "1px solid var(--blue)" }
          : { color: "var(--khaki)", background: "var(--khaki-dim)", border: "1px dashed var(--khaki)" }
      }
      title={statewide ? "Unrestricted — the officer could see every district" : `Bound to ${scope}`}
    >
      {statewide ? "Statewide" : `▮ ${scope}`}
    </span>
  );
}

function RunRow({ run }: { run: AuditRunRow }) {
  const [open, setOpen] = useState(false);
  const calls = run.toolCallCount ?? run.steps.length;

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${run.failed ? "var(--red)" : "var(--border)"}`,
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-4 py-2.5"
        style={{ background: open ? "var(--bg-raised)" : "transparent" }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-data text-[11px] shrink-0" style={{ color: "var(--text-muted)" }}>
            {fmtWhen(run.createdAt)}
          </span>
          <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
            {run.officer ?? "unattributed"}
          </span>
          {run.role && (
            <span
              className="font-data text-[10px] uppercase tracking-wider shrink-0"
              style={{ color: "var(--text-muted)" }}
            >
              {run.role}
            </span>
          )}
          <ScopeBadge scope={run.scope} />
          <span className="ml-auto flex items-center gap-2 shrink-0">
            {run.failed && (
              <span
                className="font-data text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                style={{ color: "var(--red)", background: "var(--red-dim)", border: "1px solid var(--red)" }}
              >
                Failed
              </span>
            )}
            <span className="font-data text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
              {calls} call{calls === 1 ? "" : "s"} · {fmtMs(run.durationMs)}
            </span>
            <span className="font-data text-[11px]" style={{ color: "var(--text-muted)" }}>
              {open ? "▾" : "▸"}
            </span>
          </span>
        </div>
        <p className="text-sm mt-1.5 truncate" style={{ color: "var(--text-primary)" }}>
          {run.question || "—"}
        </p>
      </button>

      {open && (
        <div className="px-4 py-3 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
          {run.finalAnswer && (
            <Field label="Answer given">
              <p
                className="text-xs whitespace-pre-wrap overflow-y-auto"
                style={{ color: "var(--text-secondary)", maxHeight: 160 }}
              >
                {run.finalAnswer}
              </p>
            </Field>
          )}

          {run.steps.length ? (
            <div className="space-y-2">
              {run.steps.map((step, i) => (
                <StepCard key={step.id} step={step} index={i + 1} />
              ))}
            </div>
          ) : (
            <p className="text-xs font-data" style={{ color: "var(--text-muted)" }}>
              This run answered without calling a tool.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StepCard({ step, index }: { step: AuditStepRow; index: number }) {
  const failed = step.status === "error";
  return (
    <div
      className="rounded-md"
      style={{ background: "var(--bg-raised)", border: `1px solid ${failed ? "var(--red)" : "var(--border-subtle)"}` }}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="font-data text-[11px] w-4 shrink-0" style={{ color: "var(--text-muted)" }}>
          {index}
        </span>
        <span
          className="font-data text-[11px] px-2 py-0.5 rounded"
          style={{ background: "var(--khaki-dim)", border: "1px solid var(--khaki)", color: "var(--khaki)" }}
        >
          {step.tool ?? "—"}
        </span>
        <span
          className="font-data text-[10px] font-bold uppercase tracking-widest"
          style={{ color: failed ? "var(--red)" : "var(--green)" }}
        >
          {step.status ?? "—"}
        </span>
        <span className="font-data text-[11px] ml-auto tabular-nums" style={{ color: "var(--text-muted)" }}>
          {step.rowCount == null ? "— rows" : `${step.rowCount} row${step.rowCount === 1 ? "" : "s"}`} ·{" "}
          {fmtMs(step.durationMs)}
        </span>
      </div>
      <div className="px-3 pb-2.5 space-y-2">
        <Payload label="Args" text={step.args} />
        {/* The trail stores a truncated result with its own "… [truncated N chars]"
            marker; it stays as written so the reviewer knows they are not
            looking at the whole thing. */}
        <Payload label="Result" text={step.result} accent={failed ? "var(--red)" : undefined} />
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

/** Scrolls inside its own box — one long JSON line must never widen the page. */
function Payload({ label, text, accent }: { label: string; text: string | null; accent?: string }) {
  if (!text) return null;
  return (
    <div>
      <div
        className="font-data text-[10px] font-bold uppercase tracking-widest mb-1"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </div>
      <pre
        className="font-data text-xs rounded-md px-2.5 py-2"
        style={{
          background: "var(--bg-input)",
          border: `1px solid ${accent ?? "var(--border)"}`,
          color: accent ?? "var(--text-secondary)",
          maxHeight: 180,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {text}
      </pre>
    </div>
  );
}
