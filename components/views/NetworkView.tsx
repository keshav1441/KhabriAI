"use client";
import { useEffect, useState } from "react";
import { NetworkGraph, type CoOffenderNode, type CoOffenderEdge } from "../viz/NetworkGraph";

export function NetworkView() {
  const [graph, setGraph] = useState<{ nodes: CoOffenderNode[]; edges: CoOffenderEdge[] }>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/network-data")
      .then((r) => r.json())
      .then((d) => { setGraph({ nodes: d.nodes ?? [], edges: d.edges ?? [] }); setLoading(false); })
      .catch(() => { setError("Failed to load network data"); setLoading(false); });
  }, []);

  const crews = graph.edges.length;

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
            Persons linked by shared cases. Crews cluster together; click a node to isolate its associates.
          </p>
        </div>
        {!loading && !error && (
          <div className="text-right shrink-0">
            <div className="font-display font-bold" style={{ color: "var(--ink)", fontSize: "1.4rem", lineHeight: 1 }}>
              {graph.nodes.length}
            </div>
            <div className="font-data" style={{ color: "var(--text-muted)", fontSize: "0.6rem", letterSpacing: "0.1em" }}>
              PERSONS · {crews} LINKS
            </div>
          </div>
        )}
      </div>

      {/* Graph */}
      <div className="flex-1 overflow-hidden p-4">
        {loading && (
          <div className="h-full flex items-center justify-center">
            <span className="font-data text-sm" style={{ color: "var(--text-muted)" }}>
              Building co-offender network…
            </span>
          </div>
        )}
        {error && (
          <div className="h-full flex items-center justify-center">
            <span className="text-sm" style={{ color: "var(--red)" }}>{error}</span>
          </div>
        )}
        {!loading && !error && graph.nodes.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>No recurring co-offender links found.</span>
          </div>
        )}
        {!loading && !error && graph.nodes.length > 0 && (
          <div style={{ height: "100%" }}>
            <NetworkGraph graph={graph} />
          </div>
        )}
      </div>

      {/* Legend */}
      {!loading && !error && graph.nodes.length > 0 && (
        <div
          className="shrink-0 px-6 py-2 flex items-center gap-5 flex-wrap"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <LegendDot color="var(--ink)" label="Person · size = case count" />
          <LegendDot color="var(--border)" line label="Shared cases · thicker = more" />
          <LegendDot color="var(--red)" ring label="Kingpin · 3+ associates" />
          <p className="ml-auto text-xs font-data" style={{ color: "var(--text-muted)" }}>
            Click a node to isolate · Drag to pan
          </p>
        </div>
      )}
    </div>
  );
}

function LegendDot({ color, shape, ring, line, label }: { color: string; shape?: string; ring?: boolean; line?: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {line ? (
        <span className="inline-block shrink-0" style={{ width: 14, height: 3, background: color, borderRadius: 2 }} />
      ) : (
        <span
          className="inline-block w-3 h-3 shrink-0"
          style={{
            background: ring ? "transparent" : color,
            border: ring ? `2px solid ${color}` : undefined,
            borderRadius: shape === "diamond" ? "2px" : "50%",
            transform: shape === "diamond" ? "rotate(45deg)" : undefined,
          }}
        />
      )}
      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</span>
    </div>
  );
}
