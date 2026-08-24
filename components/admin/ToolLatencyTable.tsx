"use client";
import type { AuditSummary } from "@/lib/audit";
import { fmtMs } from "./AuditRunList";

/**
 * The operational read on the trail: which tool is slow, which one errors.
 * Failure rate rather than raw failures decides the tone — two errors out of
 * three calls is a broken tool, two out of two thousand is a bad afternoon.
 */
export function ToolLatencyTable({ byTool }: { byTool: AuditSummary["byTool"] }) {
  if (!byTool.length) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        No tool calls recorded in this window.
      </p>
    );
  }

  const slowest = Math.max(...byTool.map((t) => t.medianMs ?? 0), 1);

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="w-full text-left" style={{ minWidth: 460, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Tool", "Calls", "Failures", "Median"].map((h, i) => (
              <th
                key={h}
                className="font-data text-[10px] font-bold uppercase tracking-widest pb-2"
                style={{
                  color: "var(--text-muted)",
                  textAlign: i === 0 ? "left" : "right",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {byTool.map((t) => {
            const bad = t.failures > 0 && t.failures / Math.max(t.calls, 1) >= 0.1;
            return (
              <tr key={t.tool} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td className="font-data text-xs py-1.5 pr-3" style={{ color: "var(--text-primary)" }}>
                  {t.tool}
                </td>
                <td
                  className="font-data text-xs py-1.5 tabular-nums"
                  style={{ color: "var(--text-secondary)", textAlign: "right" }}
                >
                  {t.calls}
                </td>
                <td
                  className="font-data text-xs py-1.5 tabular-nums"
                  style={{
                    color: t.failures > 0 ? "var(--red)" : "var(--text-muted)",
                    fontWeight: bad ? 700 : 400,
                    textAlign: "right",
                  }}
                >
                  {t.failures}
                </td>
                <td className="py-1.5 pl-3" style={{ textAlign: "right", width: "38%" }}>
                  <span className="flex items-center gap-2 justify-end">
                    <span className="h-1.5 rounded-full overflow-hidden flex-1" style={{ background: "var(--bg-raised)" }}>
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${((t.medianMs ?? 0) / slowest) * 100}%`,
                          background: "var(--khaki)",
                        }}
                      />
                    </span>
                    <span
                      className="font-data text-xs tabular-nums shrink-0"
                      style={{ color: "var(--text-secondary)", minWidth: 52 }}
                    >
                      {fmtMs(t.medianMs)}
                    </span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
