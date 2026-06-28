"use client";
import { useEffect, useRef } from "react";

interface Props {
  rows: Record<string, unknown>[];
}

export function NetworkGraph({ rows }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || typeof window === "undefined" || !rows.length) return;

    let cy: import("cytoscape").Core | null = null;

    Promise.all([
      import("cytoscape"),
      import("cytoscape-cose-bilkent"),
    ]).then(([cytoscapeModule, coseBilkentModule]) => {
      const cytoscape = cytoscapeModule.default;
      const coseBilkent = coseBilkentModule.default;

      try {
        cytoscape.use(coseBilkent as Parameters<typeof cytoscape.use>[0]);
      } catch {}

      const nodes: import("cytoscape").ElementDefinition[] = [];
      const edges: import("cytoscape").ElementDefinition[] = [];
      const nodeIds = new Set<string>();

      const firstRow = rows[0];

      // Mode A: accused-case list (AccusedName + case_count)
      const isAccusedMode =
        "AccusedName" in firstRow ||
        "accused_name" in firstRow ||
        "accusedname" in firstRow;

      if (isAccusedMode) {
        // Each accused = node, size = case count
        for (const r of rows.slice(0, 80)) {
          const name =
            String(r.AccusedName ?? r.accused_name ?? r.accusedname ?? "Unknown");
          const count = Number(
            r.case_count ?? r.CaseCount ?? r.cases ?? r.total ?? 1
          );
          const crimeType = String(
            r.crime_types ?? r.CrimeGroupName ?? r.crime_type ?? ""
          );
          const id = name;
          if (!nodeIds.has(id)) {
            nodeIds.add(id);
            nodes.push({
              data: {
                id,
                label: name.split(" ").slice(0, 2).join(" "),
                count,
                crimeType,
                type: "accused",
              },
            });
          }
        }

        // Group accused with same crime type into a crime-type hub
        const crimeHubs = new Set<string>();
        for (const r of rows.slice(0, 80)) {
          const name = String(r.AccusedName ?? r.accused_name ?? "Unknown");
          const crimeType = String(r.crime_types ?? r.CrimeGroupName ?? r.crime_type ?? "").split(",")[0].trim();
          if (!crimeType) continue;
          if (!crimeHubs.has(crimeType)) {
            crimeHubs.add(crimeType);
            if (!nodeIds.has(`crime_${crimeType}`)) {
              nodeIds.add(`crime_${crimeType}`);
              nodes.push({ data: { id: `crime_${crimeType}`, label: crimeType, type: "crime" } });
            }
          }
          edges.push({ data: { source: name, target: `crime_${crimeType}`, id: `e_${name}_${crimeType}` } });
        }
      } else {
        // Mode B: explicit edge pairs (old CaseLink style)
        for (const r of rows.slice(0, 200)) {
          const a = String(
            r.incident_id ?? r["incidentaid"] ?? r["incidentAId"] ?? r.case_a ?? ""
          );
          const b = String(
            r["incidentbid"] ?? r["incidentBId"] ?? r.case_b ?? ""
          );
          const linkType = String(r["linktype"] ?? r["linkType"] ?? "linked");

          if (!a) continue;
          if (!nodeIds.has(a)) {
            nodeIds.add(a);
            nodes.push({ data: { id: a, label: a.slice(-6), type: "incident" } });
          }
          if (b && b !== "undefined") {
            if (!nodeIds.has(b)) {
              nodeIds.add(b);
              nodes.push({ data: { id: b, label: b.slice(-6), type: "incident" } });
            }
            edges.push({ data: { source: a, target: b, linkType } });
          }
        }
      }

      if (!nodes.length) return;

      cy = cytoscape({
        container: containerRef.current,
        elements: [...nodes, ...edges],
        style: [
          {
            selector: "node[type='accused']",
            style: {
              "background-color": "#10b981",
              "border-color": "#064e3b",
              "border-width": 2,
              label: "data(label)",
              color: "#e2e8f0",
              "font-size": 9,
              "text-valign": "bottom",
              "text-margin-y": 4,
              width: "mapData(count, 1, 10, 20, 55)",
              height: "mapData(count, 1, 10, 20, 55)",
            },
          },
          {
            selector: "node[type='crime']",
            style: {
              "background-color": "#f59e0b",
              "border-color": "#b45309",
              "border-width": 2,
              label: "data(label)",
              color: "#fef3c7",
              "font-size": 8,
              "text-valign": "bottom",
              "text-margin-y": 4,
              width: 36,
              height: 36,
              shape: "diamond",
            },
          },
          {
            selector: "node[type='incident']",
            style: {
              "background-color": "#3b82f6",
              "border-color": "#1d4ed8",
              "border-width": 2,
              label: "data(label)",
              color: "#e2e8f0",
              "font-size": 9,
              "text-valign": "bottom",
              "text-margin-y": 4,
              width: 28,
              height: 28,
            },
          },
          {
            selector: "edge",
            style: {
              "line-color": "#334155",
              width: 1.5,
              "target-arrow-color": "#475569",
              "target-arrow-shape": "triangle",
              "curve-style": "bezier",
              opacity: 0.6,
            },
          },
          {
            selector: "node:selected",
            style: { "background-color": "#ef4444", "border-color": "#dc2626" },
          },
        ],
        layout: {
          name: "cose-bilkent",
          animate: true,
          animationDuration: 900,
          nodeDimensionsIncludeLabels: true,
          randomize: false,
          idealEdgeLength: 90,
          nodeRepulsion: 5000,
        } as Parameters<import("cytoscape").Core["layout"]>[0],
      });

      cy.on("tap", "node", (e) => {
        const node = e.target;
        const d = node.data();
        const label =
          d.type === "accused"
            ? `${d.label}\n${d.count} case(s)\n${d.crimeType}`
            : d.label;
        // tooltip via title trick
        node.qtip?.({ content: label });
      });
    });

    return () => {
      cy?.destroy();
    };
  }, [rows]);

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)", height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        ref={containerRef}
        style={{ flex: 1, background: "var(--bg-raised)", minHeight: 340 }}
      />
    </div>
  );
}
