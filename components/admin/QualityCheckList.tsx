"use client";
import { useState } from "react";
// Type-only — lib/data-quality.ts reaches for the server Prisma client, so this
// import must never survive into the browser bundle.
import type { QualityCheck, Severity } from "@/lib/data-quality";

/**
 * The ranked list of what is wrong with the records.
 *
 * A failing check leads with its count and rate; the "why it matters" line sits
 * under the title rather than behind a tooltip, because a reviewer who does not
 * already know what an empty act/section costs is exactly the reader this page
 * is for. Example CrimeNos fold away — they are for going and looking, which is
 * a second step, not part of the scan.
 *
 * Clean checks stay on the page, greyed and collapsed to one line. A check that
 * passes is a thing that was tested, and dropping it would make the console
 * look like it only ever finds problems.
 */

export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "var(--red)",
  warning: "var(--amber)",
  info: "var(--blue)",
};

const DENOMINATOR_LABEL: Record<QualityCheck["denominator"], string> = {
  cases: "FIRs",
  arrests: "arrests",
  stations: "stations",
};

export const fmtPct = (pct: number) =>
  pct === 0 ? "0%" : pct < 0.1 ? "<0.1%" : `${pct.toFixed(pct < 10 ? 1 : 0)}%`;

export function SeverityBadge({ severity }: { severity: Severity }) {
  const color = SEVERITY_COLOR[severity];
  return (
    <span
      className="font-data text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid ${color}` }}
    >
      {severity}
    </span>
  );
}

export function QualityCheckList({ checks, loading }: { checks: QualityCheck[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg animate-pulse"
            style={{ height: 62, background: "var(--bg-raised)", animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    );
  }

  if (!checks.length) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        No checks ran.
      </p>
    );
  }

  const failing = checks.filter((c) => c.affected > 0);
  const clean = checks.filter((c) => c.affected === 0);

  return (
    <div className="space-y-4">
      {failing.length === 0 ? (
        <div
          className="rounded-lg px-4 py-8 text-center"
          style={{ background: "var(--green-dim)", border: "1px solid var(--green)" }}
        >
          <div
            className="font-data text-[10px] font-bold uppercase tracking-widest mb-1"
            style={{ color: "var(--green)" }}
          >
            Nothing failing
          </div>
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            All {checks.length} checks passed against the case data.
          </p>
          <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
            Every check still ran — they are listed below with a zero, not hidden.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {failing.map((c) => (
            <CheckRow key={c.key} check={c} />
          ))}
        </div>
      )}

      {clean.length > 0 && (
        <div>
          <h3
            className="font-data text-[10px] font-bold uppercase tracking-widest mb-1.5"
            style={{ color: "var(--text-muted)" }}
          >
            Passing · {clean.length}
          </h3>
          <div className="space-y-1">
            {clean.map((c) => (
              <div key={c.key} className="flex items-center gap-2">
                <span className="font-data text-xs shrink-0" style={{ color: "var(--green)" }}>
                  ✓
                </span>
                <span className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                  {c.title}
                </span>
                <span
                  className="font-data text-[10px] tabular-nums ml-auto shrink-0"
                  style={{ color: "var(--text-muted)" }}
                >
                  0 / {c.total.toLocaleString("en-IN")} {DENOMINATOR_LABEL[c.denominator]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CheckRow({ check }: { check: QualityCheck }) {
  const [open, setOpen] = useState(false);
  const color = SEVERITY_COLOR[check.severity];

  return (
    <div
      className="rounded-lg"
      style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderLeft: `3px solid ${color}` }}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <SeverityBadge severity={check.severity} />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {check.title}
              </span>
            </div>
            <p className="text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
              {check.why}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <div className="font-data text-lg font-bold leading-none tabular-nums" style={{ color }}>
              {check.affected.toLocaleString("en-IN")}
            </div>
            <div className="font-data text-[10px] mt-1 tabular-nums" style={{ color: "var(--text-muted)" }}>
              {fmtPct(check.pct)} of {check.total.toLocaleString("en-IN")}
            </div>
          </div>
        </div>

        {/* The rate at a glance: a bar floored at a hairline so a 0.005% check
            still shows it is non-zero rather than reading as clean. */}
        <div className="h-1 rounded-full overflow-hidden mt-2" style={{ background: "var(--bg-base)" }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.max(check.pct, check.affected > 0 ? 0.8 : 0)}%`, background: color }}
          />
        </div>

        {check.examples.length > 0 && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="font-data text-[10px] font-bold uppercase tracking-widest mt-2"
            style={{ color: "var(--text-muted)" }}
          >
            {open ? "▾" : "▸"} {check.denominator === "stations" ? "Stations" : "Examples"}
          </button>
        )}

        {open && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {check.examples.map((ex) => (
              <span
                key={ex}
                className="font-data text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  color: "var(--text-secondary)",
                  background: "var(--bg-base)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {ex}
              </span>
            ))}
            {check.affected > check.examples.length && (
              <span className="font-data text-[10px] px-1.5 py-0.5" style={{ color: "var(--text-muted)" }}>
                +{(check.affected - check.examples.length).toLocaleString("en-IN")} more
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
