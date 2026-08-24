"use client";
// Type-only — lib/data-quality.ts reaches for the server Prisma client, so this
// import must never survive into the browser bundle.
import type { DistrictQuality } from "@/lib/data-quality";
import { fmtPct } from "./QualityCheckList";

/**
 * Where the bad records sit.
 *
 * A statewide percentage tells a reviewer nothing about who to write to. Sorted
 * worst-first and scaled against the worst district rather than against 100%,
 * because the interesting spread at this data volume is between 0.1% and 2%,
 * and a bar scaled to 100 would draw all thirty districts as empty.
 */
export function DistrictQualityTable({ districts, loading }: { districts: DistrictQuality[]; loading: boolean }) {
  if (loading) {
    return <div className="rounded animate-pulse" style={{ height: 200, background: "var(--bg-raised)" }} />;
  }

  if (!districts.length) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        No cases to break down by district.
      </p>
    );
  }

  const worst = Math.max(...districts.map((d) => d.pct), 0.0001);
  const anyDefects = districts.some((d) => d.defects > 0);

  if (!anyDefects) {
    return (
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        No district has a single FIR failing a case-level check — all{" "}
        {districts.length} are clean.
      </p>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="w-full text-left" style={{ minWidth: 460, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["District", "FIRs", "With defects", "Rate"].map((h, i) => (
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
          {districts.map((d) => (
            <tr key={d.district} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <td className="text-xs py-1.5 pr-3" style={{ color: "var(--text-primary)" }}>
                {d.district}
              </td>
              <td
                className="font-data text-xs py-1.5 tabular-nums"
                style={{ color: "var(--text-secondary)", textAlign: "right" }}
              >
                {d.cases.toLocaleString("en-IN")}
              </td>
              <td
                className="font-data text-xs py-1.5 tabular-nums"
                style={{ color: d.defects > 0 ? "var(--amber)" : "var(--text-muted)", textAlign: "right" }}
              >
                {d.defects.toLocaleString("en-IN")}
              </td>
              <td className="py-1.5 pl-3" style={{ textAlign: "right", width: "40%" }}>
                <span className="flex items-center gap-2 justify-end">
                  <span className="h-1.5 rounded-full overflow-hidden flex-1" style={{ background: "var(--bg-raised)" }}>
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${(d.pct / worst) * 100}%`, background: "var(--amber)" }}
                    />
                  </span>
                  <span
                    className="font-data text-xs tabular-nums shrink-0"
                    style={{ color: "var(--text-secondary)", minWidth: 46 }}
                  >
                    {fmtPct(d.pct)}
                  </span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
