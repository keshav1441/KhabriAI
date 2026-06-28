"use client";
import { useEffect, useState, useCallback } from "react";
import { CaseDrawer } from "../viz/CaseDrawer";

type CaseRow = {
  case_id: number;
  crime_no: string;
  case_no: string;
  date_registered: string | null;
  crime_group: string;
  district: string;
  status: string;
};

const STATUS_COLOR: Record<string, string> = {
  "Under Investigation": "var(--amber)",
  "Charge Sheeted": "var(--blue)",
  "Closed": "var(--green)",
  "False Case": "var(--red)",
};

export function ReportsView() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadCases = useCallback((q: string) => {
    setLoading(true);
    fetch(`/api/reports?q=${encodeURIComponent(q)}&limit=100`)
      .then((r) => r.json())
      .then((d) => { setCases(d.cases ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { loadCases(debouncedSearch); }, [debouncedSearch, loadCases]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className="shrink-0 px-6 py-3 flex items-center gap-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex-1 relative max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            style={{ color: "var(--text-muted)" }}
          >
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Filter by district, crime type, or crime no…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md outline-none transition-all"
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
            onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--red)"; }}
            onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--border)"; }}
          />
        </div>
        <span className="font-data text-xs" style={{ color: "var(--text-muted)" }}>
          {loading ? "Loading…" : `${cases.length} cases`}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <span className="font-data text-sm" style={{ color: "var(--text-muted)" }}>
              Retrieving case records…
            </span>
          </div>
        ) : cases.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>No cases found.</span>
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ background: "var(--bg-raised)", position: "sticky", top: 0, zIndex: 1 }}>
                {["Crime No.", "Date", "Crime Group", "District", "Status", ""].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-2.5 font-data font-bold tracking-widest uppercase"
                    style={{
                      color: "var(--text-muted)",
                      borderBottom: "1px solid var(--border)",
                      fontSize: "0.6rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cases.map((c, i) => (
                <tr
                  key={c.case_id}
                  style={{ borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-raised)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "transparent" : "var(--bg-surface)"; }}
                  onClick={() => setSelectedId(c.case_id)}
                >
                  <td className="px-4 py-2.5 font-data" style={{ color: "var(--text-primary)" }}>
                    {c.crime_no || "—"}
                  </td>
                  <td className="px-4 py-2.5 font-data whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                    {c.date_registered
                      ? new Date(c.date_registered).toLocaleDateString("en-IN", {
                          day: "2-digit", month: "short", year: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-primary)", maxWidth: 180 }}>
                    <span className="truncate block">{c.crime_group}</span>
                  </td>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>
                    {c.district}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="font-data px-2 py-0.5 rounded text-xs font-bold"
                      style={{
                        color: STATUS_COLOR[c.status] ?? "var(--text-muted)",
                        background: STATUS_COLOR[c.status]
                          ? `${STATUS_COLOR[c.status].replace(")", ",0.1)").replace("var(", "var(")}`
                          : "var(--bg-raised)",
                        fontSize: "0.65rem",
                      }}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className="font-data text-xs font-bold px-2 py-0.5 rounded transition-all"
                      style={{ color: "var(--red)", background: "var(--red-dim)" }}
                    >
                      OPEN ↗
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CaseDrawer caseId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
