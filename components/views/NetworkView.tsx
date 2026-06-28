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
          <h2 className="font-bold text-sm tracking-tight" style={{ color: "var(--text-primary)" }}>
            CRIMINAL NETWORK GRAPH
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Accused with 2+ linked cases · Green = suspect · Yellow = crime type
          </p>
        </div>
        {!loading && (
          <span className="font-data text-xs" style={{ color: "var(--text-muted)" }}>
            {rows.length} suspects mapped
          </span>
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
          className="shrink-0 px-6 py-2 flex items-center gap-6"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <LegendDot color="#2DCA6F" label="Accused (size = case count)" />
          <LegendDot color="#F0A500" shape="diamond" label="Crime type" />
          <p className="ml-auto text-xs" style={{ color: "var(--text-muted)" }}>
            Click nodes to select · Drag to pan
          </p>
        </div>
      )}
    </div>
  );
}

function LegendDot({ color, shape, label }: { color: string; shape?: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block w-3 h-3 rounded-sm shrink-0"
        style={{
          background: color,
          transform: shape === "diamond" ? "rotate(45deg)" : undefined,
        }}
      />
      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</span>
    </div>
  );
}
