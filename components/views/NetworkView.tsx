"use client";
import { useEffect, useState } from "react";
import { NetworkGraph } from "../viz/NetworkGraph";

type Row = { AccusedName: string; case_count: number; crime_types: string };

export function NetworkView() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/network-data")
      .then((r) => r.json())
      .then((d) => { setRows(d.rows ?? []); setLoading(false); })
      .catch(() => { setError("Failed to load network data"); setLoading(false); });
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="shrink-0 px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div>
          <h2 className="font-display font-bold tracking-tight" style={{ color: "var(--text-primary)", fontSize: "1.05rem" }}>
            ಅಪರಾಧಿ ಜಾಲ · CRIMINAL NETWORK
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Repeat accused (2+ cases) linked to every crime group they operate in. Click a node to isolate its network.
          </p>
        </div>
        {!loading && (
          <div className="text-right shrink-0">
            <div className="font-display font-bold" style={{ color: "var(--ink)", fontSize: "1.4rem", lineHeight: 1 }}>
              {rows.length}
            </div>
            <div className="font-data" style={{ color: "var(--text-muted)", fontSize: "0.6rem", letterSpacing: "0.1em" }}>
              SUSPECTS MAPPED
            </div>
          </div>
        )}
      </div>

      {/* Graph */}
      <div className="flex-1 overflow-hidden p-4">
        {loading && (
          <div className="h-full flex items-center justify-center">
            <span className="font-data text-sm" style={{ color: "var(--text-muted)" }}>
              Building network graph…
            </span>
          </div>
        )}
        {error && (
          <div className="h-full flex items-center justify-center">
            <span className="text-sm" style={{ color: "var(--red)" }}>{error}</span>
          </div>
        )}
        {!loading && !error && rows.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>No multi-case accused found.</span>
          </div>
        )}
        {!loading && !error && rows.length > 0 && (
          <div style={{ height: "100%" }}>
            <NetworkGraph rows={rows} />
          </div>
        )}
      </div>

      {/* Legend */}
      {!loading && rows.length > 0 && (
        <div
          className="shrink-0 px-6 py-2 flex items-center gap-5 flex-wrap"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <LegendDot color="var(--ink)" label="Accused · size = case count" />
          <LegendDot color="var(--khaki)" shape="diamond" label="Crime group" />
          <LegendDot color="var(--red)" ring label="Priority · top 10 most-linked" />
          <p className="ml-auto text-xs font-data" style={{ color: "var(--text-muted)" }}>
            Click a node to isolate · Drag to pan
          </p>
        </div>
      )}
    </div>
  );
}

function LegendDot({ color, shape, ring, label }: { color: string; shape?: string; ring?: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block w-3 h-3 shrink-0"
        style={{
          background: ring ? "transparent" : color,
          border: ring ? `2px solid ${color}` : undefined,
          borderRadius: shape === "diamond" ? "2px" : "50%",
          transform: shape === "diamond" ? "rotate(45deg)" : undefined,
        }}
      />
      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</span>
    </div>
  );
}
