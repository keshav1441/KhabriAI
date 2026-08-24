"use client";
import { useState } from "react";
import Link from "next/link";
// Type-only — lib/misuse.ts reaches for the server Prisma client, so this
// import must never survive into the browser bundle.
import type { MisuseFinding, MisuseSeverity } from "@/lib/misuse";

/**
 * Findings, as a reviewer has to be able to read them: the concern and the
 * innocent explanation on the same card, and the runs behind it one click away.
 *
 * The card is written so that a reviewer who reads only the front of it still
 * reads a question, never a verdict. That is why "What would explain it" is not
 * hidden behind the expander — a reviewer who only skims must still see it.
 */

const SEVERITY: Record<MisuseSeverity, { label: string; color: string; dim: string }> = {
  elevated: { label: "Look first", color: "var(--red)", dim: "var(--red-dim)" },
  moderate: { label: "Worth asking", color: "var(--khaki)", dim: "var(--khaki-dim)" },
  low: { label: "Context only", color: "var(--blue)", dim: "var(--blue-dim)" },
};

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function MisuseFindingList({
  findings,
  loading,
  runsExamined,
}: {
  findings: MisuseFinding[];
  loading: boolean;
  runsExamined: number;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg animate-pulse"
            style={{ height: 96, background: "var(--bg-raised)", animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    );
  }

  // A clean trail is a result, not a blank page. The distinction matters here
  // more than anywhere else in the app: an empty frame reads as "the check is
  // broken", and the whole point of this console is that it is running.
  if (!findings.length) {
    return (
      <div
        className="rounded-lg px-4 py-10 text-center"
        style={{ background: "var(--bg-surface)", border: "1px dashed var(--green)" }}
      >
        <div
          className="font-data text-[10px] font-bold uppercase tracking-widest mb-2"
          style={{ color: "var(--green)" }}
        >
          Nothing flagged
        </div>
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>
          {runsExamined === 0
            ? "No queries were recorded in this window, so there was nothing to check."
            : `Every one of the ${runsExamined} recorded run${runsExamined === 1 ? "" : "s"} was checked against all six signals and none of them fired.`}
        </p>
        <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>
          The checks ran. This is a clean result, not an empty screen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {findings.map((f) => (
        <FindingCard key={f.key} finding={f} />
      ))}
    </div>
  );
}

function FindingCard({ finding }: { finding: MisuseFinding }) {
  const [open, setOpen] = useState(false);
  const sev = SEVERITY[finding.severity];

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: "var(--bg-surface)", border: `1px solid ${sev.color}` }}>
      <div className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <span
            className="font-data text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded shrink-0"
            style={{ color: sev.color, background: sev.dim, border: `1px solid ${sev.color}` }}
          >
            {sev.label}
          </span>
          <span className="font-data text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            {finding.signal}
          </span>
          <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
            {finding.officer}
          </span>
          <span className="font-data text-[11px] ml-auto shrink-0" style={{ color: "var(--text-muted)" }}>
            {fmtWhen(finding.occurredAt)}
          </span>
        </div>

        <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          {finding.title}
        </h3>
        <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
          {finding.detail}
        </p>

        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          <Note label="Why it is a concern" text={finding.why} />
          <Note label="What would explain it" text={finding.benign} accent="var(--green)" />
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          <button
            onClick={() => setOpen((v) => !v)}
            className="font-data text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md"
            style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            {open ? "▾" : "▸"} {finding.runs.length} run{finding.runs.length === 1 ? "" : "s"} behind this
          </button>
          <Link
            href={`/admin/audit?officer=${encodeURIComponent(finding.officer)}`}
            title="Opens the audit trail. Put this officer's email in its officer filter to see everything they asked."
            className="font-data text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md"
            style={{ color: "var(--khaki)", border: "1px solid var(--khaki)", background: "var(--khaki-dim)" }}
          >
            Full trail for {finding.officer} →
          </Link>
        </div>
      </div>

      {open && (
        <div className="px-4 py-3 space-y-1.5" style={{ borderTop: "1px solid var(--border)" }}>
          {finding.runs.map((r) => (
            <div key={r.runId} className="flex flex-wrap items-baseline gap-2">
              <span className="font-data text-[11px] shrink-0" style={{ color: "var(--text-muted)" }}>
                {fmtWhen(r.at)}
              </span>
              <span
                className="font-data text-[10px] uppercase tracking-wider shrink-0"
                style={{ color: r.scope === "Statewide" ? "var(--blue)" : "var(--khaki)" }}
              >
                {r.scope}
              </span>
              <span className="text-xs min-w-0 flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                {r.question || "—"}
              </span>
            </div>
          ))}
          <p className="text-[11px] pt-1" style={{ color: "var(--text-muted)" }}>
            The questions as the officer asked them. The tool calls and results are in the audit trail under the same
            run.
          </p>
        </div>
      )}
    </div>
  );
}

function Note({ label, text, accent }: { label: string; text: string; accent?: string }) {
  return (
    <div className="rounded-md px-2.5 py-2" style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)" }}>
      <div
        className="font-data text-[10px] font-bold uppercase tracking-widest mb-1"
        style={{ color: accent ?? "var(--text-muted)" }}
      >
        {label}
      </div>
      <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {text}
      </p>
    </div>
  );
}

/** The ranked officer strip. Ordered by what fired, never by how much they ask. */
export function OfficerRanking({
  rows,
}: {
  rows: { officer: string; role: string | null; runs: number; score: number; findings: number; signals: string[] }[];
}) {
  if (!rows.length) {
    return (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        No officer has a signal against them in this window.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {rows.map((o) => (
        <div key={o.officer} className="flex flex-wrap items-center gap-2">
          <span className="text-xs truncate" style={{ color: "var(--text-primary)", minWidth: 170 }}>
            {o.officer}
          </span>
          {o.role && (
            <span className="font-data text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              {o.role}
            </span>
          )}
          <span className="flex flex-wrap gap-1">
            {o.signals.map((s) => (
              <span
                key={s}
                className="font-data text-[10px] px-1.5 py-0.5 rounded"
                style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              >
                {s}
              </span>
            ))}
          </span>
          <span className="font-data text-[11px] tabular-nums ml-auto" style={{ color: "var(--text-muted)" }}>
            {o.runs} run{o.runs === 1 ? "" : "s"}
          </span>
          <span
            className="font-data text-xs font-bold tabular-nums"
            style={{ color: "var(--red)", minWidth: 18, textAlign: "right" }}
            title="Sum of the weights of the signals that fired — a queue order for reviewers, not a rating of the officer."
          >
            {o.score}
          </span>
        </div>
      ))}
    </div>
  );
}
