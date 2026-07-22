"use client";
import { useEffect, useRef } from "react";
import { useTheme } from "@/components/ThemeProvider";

interface Props {
  rows: Record<string, unknown>[];
}

export function NetworkGraph({ rows }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme(); // re-render styles when the theme flips

  useEffect(() => {
    if (!containerRef.current || typeof window === "undefined" || !rows.length) return;

    let cy: import("cytoscape").Core | null = null;

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

      const firstRow = rows[0];
      const isAccusedMode =
        "AccusedName" in firstRow || "accused_name" in firstRow || "accusedname" in firstRow;

      if (isAccusedMode) {
        // Parse each accused → the FULL list of crime groups they operate in.
        const parsed = rows.slice(0, 80).map((r) => {
          const name = String(r.AccusedName ?? r.accused_name ?? r.accusedname ?? "Unknown");
          const count = Number(r.case_count ?? r.CaseCount ?? r.cases ?? r.total ?? 1);
          const types = String(r.crime_types ?? r.CrimeGroupName ?? r.crime_type ?? "")
            .split(",").map((s) => s.trim()).filter(Boolean);
          return { name, count, types };
        });

        // Crime-type hubs (one per distinct group — not just the first one).
        for (const p of parsed) {
          for (const t of p.types) {
            const hubId = `crime_${t}`;
            if (!nodeIds.has(hubId)) {
              nodeIds.add(hubId);
              nodes.push({ data: { id: hubId, label: t, type: "crime" } });
            }
          }
        }

        // Accused nodes. `parsed` is already sorted by case count (SQL ORDER BY
        // case_count DESC), so the first 10 are the most-linked — the priority
        // targets an analyst scans for first.
        parsed.forEach((p, idx) => {
          if (nodeIds.has(p.name)) return;
          nodeIds.add(p.name);
          nodes.push({
            data: {
              id: p.name,
              label: p.name.split(" ").slice(0, 2).join(" "),
              count: p.count,
              crimeType: p.types.join(", "),
              type: "accused",
              priority: idx < 10 ? 1 : 0,
            },
          });
          // Link the accused to EVERY crime group they appear in.
          for (const t of p.types) {
            edges.push({ data: { id: `e_${p.name}_${t}`, source: p.name, target: `crime_${t}` } });
          }
        });
      }

      if (!nodes.length) return;

      // Deterministic "galaxy" layout — force layouts pile hub nodes that share
      // accused into the centre, so we place everything ourselves: crime groups
      // on an inner circle, each accused fanned into the sector of one of its
      // groups (load-balanced), edges to its other groups drawn as bridges.
      const hubNodes = nodes.filter((n) => n.data!.type === "crime");
      const Rh = 210;
      const hubAngle: Record<string, number> = {};
      hubNodes.forEach((n, i) => {
        const a = (2 * Math.PI * i) / hubNodes.length - Math.PI / 2;
        hubAngle[n.data!.id as string] = a;
        n.position = { x: Math.cos(a) * Rh, y: Math.sin(a) * Rh };
      });

      const typesByName: Record<string, string[]> = {};
      for (const p of rows.slice(0, 80).map((r) => ({
        name: String(r.AccusedName ?? r.accused_name ?? r.accusedname ?? "Unknown"),
        types: String(r.crime_types ?? r.CrimeGroupName ?? r.crime_type ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      }))) typesByName[p.name] = p.types;

      const load: Record<string, number> = {};
      hubNodes.forEach((n) => (load[n.data!.id as string] = 0));
      for (const n of nodes) {
        if (n.data!.type !== "accused") continue;
        const hubs = (typesByName[n.data!.id as string] ?? [])
          .map((t) => `crime_${t}`)
          .filter((id) => id in hubAngle);
        if (!hubs.length) { n.position = { x: 0, y: 0 }; continue; }
        hubs.sort((a, b) => load[a] - load[b]); // balance across this accused's groups
        const hub = hubs[0];
        const k = load[hub]++;
        const ring = Math.floor(k / 7);
        const within = ((k % 7) / 6 - 0.5) * 0.9; // arc spread within the sector
        const ang = hubAngle[hub] + within;
        const rad = Rh + 100 + ring * 60;
        n.position = { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad };
      }

      cy = cytoscape({
        container: containerRef.current,
        elements: [...nodes, ...edges],
        style: [
          {
            selector: "node[type='accused']",
            style: {
              "background-color": cInk,
              "border-color": cRed,
              "border-width": 0, // single-crime accused have no ring; bridges get one below
              label: "data(label)",
              color: cMuted,
              "font-size": 8,
              "font-family": "IBM Plex Mono, monospace",
              "text-valign": "bottom",
              "text-margin-y": 3,
              "min-zoomed-font-size": 7,
              width: "mapData(count, 2, 12, 22, 60)",
              height: "mapData(count, 2, 12, 22, 60)",
            },
          },
          {
            // High-activity offenders (4+ linked cases) get a visible oxblood ring.
            selector: "node[priority = 1]",
            style: { "border-color": cRed, "border-width": 3 },
          },
          {
            selector: "node[type='crime']",
            style: {
              "background-color": cKhaki,
              "border-color": cText,
              "border-width": 1.5,
              label: "data(label)",
              color: cText,
              "font-size": 12,
              "font-weight": 700,
              "font-family": "Anek Kannada, sans-serif",
              "text-valign": "bottom",
              "text-halign": "center",
              "text-margin-y": 5,
              "text-max-width": "120",
              "text-wrap": "wrap",
              "text-background-color": cBg,
              "text-background-opacity": 0.85,
              "text-background-padding": "2",
              width: 58,
              height: 58,
              shape: "round-diamond",
              "z-index": 10,
            },
          },
          {
            selector: "edge",
            style: {
              "line-color": cBorder,
              width: 1,
              "curve-style": "haystack",
              opacity: 0.55,
            },
          },
          { selector: "node:selected", style: { "background-color": cRed, "border-color": cRed } },
          { selector: ".faded", style: { opacity: 0.12 } as unknown as Record<string, unknown> },
          { selector: ".hi", style: { opacity: 1 } as unknown as Record<string, unknown> },
        ],
        layout: { name: "preset", animate: true, animationDuration: 500, fit: true, padding: 45 },
      });

      // Click a node → focus it and its neighbourhood, fade the rest.
      cy.on("tap", "node", (e) => {
        const n = e.target;
        const hood = n.closedNeighborhood();
        cy!.elements().addClass("faded").removeClass("hi");
        hood.removeClass("faded").addClass("hi");
      });
      cy.on("tap", (e) => {
        if (e.target === cy) cy!.elements().removeClass("faded hi");
      });
    });

    return () => { cy?.destroy(); };
  }, [rows, theme]);

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)", height: "100%", display: "flex", flexDirection: "column" }}>
      <div ref={containerRef} style={{ flex: 1, background: "var(--bg-raised)", minHeight: 340 }} />
    </div>
  );
}
