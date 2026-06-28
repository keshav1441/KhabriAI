"use client";
import { useState } from "react";
import { CaseDrawer } from "./CaseDrawer";

export function ResultsTable({ rows }: { rows: Record<string, unknown>[] }) {
  const [activeCaseId, setActiveCaseId] = useState<number | null>(null);

  if (!rows.length) return null;
  const columns = Object.keys(rows[0]);
  const caseIdCol = columns.find(
    (c) => c === "CaseMasterID" || c === "casemaster_id" || c === "casemasterid"
  );

  const handleRowClick = (row: Record<string, unknown>) => {
    if (!caseIdCol) return;
    const id = Number(row[caseIdCol]);
    if (!isNaN(id)) setActiveCaseId(id);
  };

  return (
    <>
      <div className="overflow-x-auto" style={{ background: "var(--bg-surface)" }}>
        <table className="min-w-full text-xs">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-2.5 text-left font-bold tracking-wider uppercase font-data"
                  style={{ color: "var(--text-muted)", background: "var(--bg-raised)", whiteSpace: "nowrap" }}
                >
                  {col}
                </th>
              ))}
              {caseIdCol && (
                <th
                  className="px-3 py-2.5 text-left font-bold tracking-wider uppercase font-data"
                  style={{ color: "var(--text-muted)", background: "var(--bg-raised)" }}
                >
                  FILE
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 100).map((row, i) => (
              <tr
                key={i}
                className="transition-all"
                style={{
                  borderBottom: "1px solid var(--border-subtle)",
                  cursor: caseIdCol ? "pointer" : "default",
                }}
                onMouseEnter={(e) => {
                  if (caseIdCol) (e.currentTarget as HTMLElement).style.background = "var(--red-dim)";
                  else (e.currentTarget as HTMLElement).style.background = "var(--bg-raised)";
                }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                onClick={() => handleRowClick(row)}
              >
                {columns.map((col) => (
                  <td
                    key={col}
                    className="px-3 py-2 font-data max-w-[200px] truncate"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {row[col] instanceof Date
                      ? (row[col] as Date).toLocaleDateString("en-IN")
                      : String(row[col] ?? "—")}
                  </td>
                ))}
                {caseIdCol && (
                  <td className="px-3 py-2">
                    <button
                      className="text-xs font-bold font-data transition-colors px-2 py-0.5 rounded"
                      style={{ color: "var(--red)", background: "var(--red-dim)" }}
                      onClick={(e) => { e.stopPropagation(); handleRowClick(row); }}
                    >
                      OPEN ↗
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 100 && (
          <div
            className="px-4 py-2 text-xs font-data text-center"
            style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}
          >
            Showing 100 of {rows.length} records
          </div>
        )}
      </div>

      {caseIdCol && (
        <CaseDrawer caseId={activeCaseId} onClose={() => setActiveCaseId(null)} />
      )}
    </>
  );
}
