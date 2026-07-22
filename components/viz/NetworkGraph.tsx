"use client";
import { useEffect, useRef } from "react";
import { useTheme } from "@/components/ThemeProvider";

export interface CoOffenderNode { id: string; name: string; caseCount: number; crimeGroup: string; degree: number }
export interface CoOffenderEdge { source: string; target: string; weight: number }

interface Props {
  // Chat "graph" viz passes accused-list rows (galaxy mode).
  rows?: Record<string, unknown>[];
  // Criminal Network view passes a real co-offender graph (force mode).
  graph?: { nodes: CoOffenderNode[]; edges: CoOffenderEdge[] };
}

export function NetworkGraph({ rows, graph }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme(); // re-render styles when the theme flips

  useEffect(() => {
    const coMode = !!graph && graph.nodes.length > 0;
    if (!containerRef.current || typeof window === "undefined") return;
    if (!coMode && !(rows && rows.length)) return;

    let cy: import("cytoscape").Core | null = null;
    let cancelled = false; // guard against the async import resolving post-unmount

    // Canvas can't read CSS variables — resolve the design tokens to hex here so
    // the graph matches the dossier palette in both themes.
    const css = getComputedStyle(document.documentElement);
    const tok = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const cInk = tok("--ink", "#26356E");
    const cKhaki = tok("--khaki", "#A67C34");
    const cRed = tok("--red", "#B21F26");
    const cBorder = tok("--border", "#C7BBA0");
    const cText = tok("--text-primary", "#211C14");
    const cMuted = tok("--text-secondary", "#57503F");
    const cBg = tok("--bg-raised", "#E3DBC8");

    Promise.all([
      import("cytoscape"),
      import("cytoscape-cose-bilkent"),
    ]).then(([cytoscapeModule, coseBilkentModule]) => {
      const cytoscape = cytoscapeModule.default;
      const coseBilkent = coseBilkentModule.default;
      try { cytoscape.use(coseBilkent as Parameters<typeof cytoscape.use>[0]); } catch {}

      const nodes: import("cytoscape").ElementDefinition[] = [];
      const edges: import("cytoscape").ElementDefinition[] = [];
      const nodeIds = new Set<string>();

      let style: import("cytoscape").CytoscapeOptions["style"];
      let layout: Parameters<import("cytoscape").Core["layout"]>[0];

      if (coMode) {
        // ── Co-offender network: persons linked by shared cases ──────────────
        // Real person↔person edges make crews cluster under a force layout.
        for (const n of graph!.nodes) {
          nodes.push({
            data: {
              id: n.id,
              label: (n.name || n.id).split(" ").slice(0, 2).join(" "),
              count: n.caseCount,
              crime: n.crimeGroup,
              kingpin: n.degree >= 3 ? 1 : 0, // hub of a crew / most connected
              type: "accused",
            },
          });
        }
        for (const e of graph!.edges) {
          edges.push({ data: { id: `${e.source}__${e.target}`, source: e.source, target: e.target, weight: e.weight } });
        }
        style = [
          {
            selector: "node[type='accused']",
            style: {
              "background-color": cInk,
              "border-color": cRed,
              "border-width": 0,
              label: "data(label)",
              color: cMuted,
              "font-size": 8,
              "font-family": "IBM Plex Mono, monospace",
              "text-valign": "bottom",
              "text-margin-y": 3,
              "min-zoomed-font-size": 7,
              width: "mapData(count, 2, 20, 20, 62)",
              height: "mapData(count, 2, 20, 20, 62)",
            },
          },
          { selector: "node[kingpin = 1]", style: { "border-color": cRed, "border-width": 3 } },
          {
            selector: "edge",
            style: {
              "line-color": cMuted,
              width: "mapData(weight, 2, 8, 2, 6)",
              "curve-style": "bezier",
              opacity: 0.7,
            },
          },
          { selector: "node:selected", style: { "background-color": cRed, "border-color": cRed } },
          { selector: ".faded", style: { opacity: 0.1 } as unknown as Record<string, unknown> },
          { selector: ".hi", style: { opacity: 1 } as unknown as Record<string, unknown> },
        ];
        layout = {
          name: "cose-bilkent",
          animate: "end",
          animationDuration: 700,
          nodeDimensionsIncludeLabels: true,
          randomize: true,
          idealEdgeLength: 40,
          nodeRepulsion: 4500,
          gravity: 0.45,
          gravityRange: 2.5,
          numIter: 2500,
          tile: true,
        } as Parameters<import("cytoscape").Core["layout"]>[0];
      } else {
        // ── Galaxy mode (chat accused-list): crime hubs + fanned accused ─────
        const parsed = rows!.slice(0, 80).map((r) => ({
          name: String(r.AccusedName ?? r.accused_name ?? r.accusedname ?? "Unknown"),
          count: Number(r.case_count ?? r.CaseCount ?? r.cases ?? r.total ?? 1),
          types: String(r.crime_types ?? r.CrimeGroupName ?? r.crime_type ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        }));

        for (const p of parsed) {
          for (const t of p.types) {
            const hubId = `crime_${t}`;
            if (!nodeIds.has(hubId)) { nodeIds.add(hubId); nodes.push({ data: { id: hubId, label: t, type: "crime" } }); }
          }
        }
        parsed.forEach((p, idx) => {
          if (nodeIds.has(p.name)) return;
          nodeIds.add(p.name);
          nodes.push({
            data: { id: p.name, label: p.name.split(" ").slice(0, 2).join(" "), count: p.count, crimeType: p.types.join(", "), type: "accused", priority: idx < 10 ? 1 : 0 },
          });
          for (const t of p.types) edges.push({ data: { id: `e_${p.name}_${t}`, source: p.name, target: `crime_${t}` } });
        });

        if (!nodes.length) return;

        // Deterministic layout — force layouts pile shared hubs into the centre.
        const hubNodes = nodes.filter((n) => n.data!.type === "crime");
        const Rh = 210;
        const hubAngle: Record<string, number> = {};
        hubNodes.forEach((n, i) => {
          const a = (2 * Math.PI * i) / hubNodes.length - Math.PI / 2;
          hubAngle[n.data!.id as string] = a;
          n.position = { x: Math.cos(a) * Rh, y: Math.sin(a) * Rh };
        });
        const typesByName: Record<string, string[]> = {};
        for (const p of parsed) typesByName[p.name] = p.types;
        const load: Record<string, number> = {};
        hubNodes.forEach((n) => (load[n.data!.id as string] = 0));
        for (const n of nodes) {
          if (n.data!.type !== "accused") continue;
          const hubs = (typesByName[n.data!.id as string] ?? []).map((t) => `crime_${t}`).filter((id) => id in hubAngle);
          if (!hubs.length) { n.position = { x: 0, y: 0 }; continue; }
          hubs.sort((a, b) => load[a] - load[b]);
          const hub = hubs[0];
          const k = load[hub]++;
          const ring = Math.floor(k / 7);
          const within = ((k % 7) / 6 - 0.5) * 0.9;
          const ang = hubAngle[hub] + within;
          const rad = Rh + 100 + ring * 60;
          n.position = { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad };
        }
        style = [
          {
            selector: "node[type='accused']",
            style: {
              "background-color": cInk, "border-color": cRed, "border-width": 0,
              label: "data(label)", color: cMuted, "font-size": 8, "font-family": "IBM Plex Mono, monospace",
              "text-valign": "bottom", "text-margin-y": 3, "min-zoomed-font-size": 7,
              width: "mapData(count, 2, 12, 22, 60)", height: "mapData(count, 2, 12, 22, 60)",
            },
          },
          { selector: "node[priority = 1]", style: { "border-color": cRed, "border-width": 3 } },
          {
            selector: "node[type='crime']",
            style: {
              "background-color": cKhaki, "border-color": cText, "border-width": 1.5, label: "data(label)", color: cText,
              "font-size": 12, "font-weight": 700, "font-family": "Anek Kannada, sans-serif",
              "text-valign": "bottom", "text-halign": "center", "text-margin-y": 5, "text-max-width": "120", "text-wrap": "wrap",
              "text-background-color": cBg, "text-background-opacity": 0.85, "text-background-padding": "2",
              width: 58, height: 58, shape: "round-diamond", "z-index": 10,
            },
          },
          { selector: "edge", style: { "line-color": cBorder, width: 1, "curve-style": "haystack", opacity: 0.55 } },
          { selector: "node:selected", style: { "background-color": cRed, "border-color": cRed } },
          { selector: ".faded", style: { opacity: 0.12 } as unknown as Record<string, unknown> },
          { selector: ".hi", style: { opacity: 1 } as unknown as Record<string, unknown> },
        ];
        layout = { name: "preset", animate: true, animationDuration: 500, fit: true, padding: 45 };
      }

      if (!nodes.length) return;
      // Bail if the effect was cleaned up (tab switch / theme toggle) while the
      // dynamic import was in flight — else cytoscape runs on a null/stale container.
      if (cancelled || !containerRef.current) return;

      cy = cytoscape({ container: containerRef.current, elements: [...nodes, ...edges], style, layout });

      // Click a node → focus it and its neighbourhood (its crew), fade the rest.
      cy.on("tap", "node", (e) => {
        const hood = e.target.closedNeighborhood();
        cy!.elements().addClass("faded").removeClass("hi");
        hood.removeClass("faded").addClass("hi");
      });
      cy.on("tap", (e) => { if (e.target === cy) cy!.elements().removeClass("faded hi"); });
    }).catch((e) => console.error("network graph render failed:", e));

    return () => { cancelled = true; cy?.destroy(); };
  }, [rows, graph, theme]);

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)", height: "100%", display: "flex", flexDirection: "column" }}>
      <div ref={containerRef} style={{ flex: 1, background: "var(--bg-raised)", minHeight: 340 }} />
    </div>
  );
}
