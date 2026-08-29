"use client";
import { useEffect, useState } from "react";
import { NetworkGraph, type CoOffenderNode, type CoOffenderEdge } from "../viz/NetworkGraph";
import { CaseDrawer } from "../viz/CaseDrawer";
import { STATUS_STYLE } from "@/lib/caseStatus";
import { useChatStore } from "@/store/chat";
import { dateLocale, t, tv } from "@/lib/i18n";

interface PersonCase {
  id: number; crimeNo: string; crimeName: string; crimeGroup: string;
  status: string; district: string | null; station: string | null;
  date: string | null; arrested: boolean;
}
interface PersonDetail {
  id: string; name: string; age: number | null; gender: string | null;
  caseCount: number; crimeGroups: string[]; cases: PersonCase[];
}

export function NetworkView() {
  const [graph, setGraph] = useState<{ nodes: CoOffenderNode[]; edges: CoOffenderEdge[] }>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const lang = useChatStore((s) => s.lang);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [openCaseId, setOpenCaseId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/network-data")
      .then((r) => r.json())
      .then((d) => { setGraph({ nodes: d.nodes ?? [], edges: d.edges ?? [] }); setLoading(false); })
      .catch(() => { setFailed(true); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    fetch(`/api/person?id=${encodeURIComponent(selectedId)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setDetail(d.id ? d : null); setDetailLoading(false); } })
      .catch(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const crews = graph.edges.length;
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null;
  const links = selectedId
    ? graph.edges
        .filter((e) => e.source === selectedId || e.target === selectedId)
        .map((e) => ({ edge: e, other: nodeById.get(e.source === selectedId ? e.target : e.source) }))
        .filter((l): l is { edge: CoOffenderEdge; other: CoOffenderNode } => !!l.other)
        .sort((a, b) => b.edge.weight - a.edge.weight)
    : [];

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(dateLocale(lang), { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="shrink-0 px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div>
          <h2 className="font-display font-bold tracking-tight" style={{ color: "var(--text-primary)", fontSize: "1.05rem" }}>
            {t("network.title", lang)}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {t("network.subtitle", lang)}
          </p>
        </div>
        {!loading && !failed && (
          <div className="text-right shrink-0">
            <div className="font-display font-bold" style={{ color: "var(--ink)", fontSize: "1.4rem", lineHeight: 1 }}>
              {graph.nodes.length}
            </div>
            <div className="font-data" style={{ color: "var(--text-muted)", fontSize: "0.6rem", letterSpacing: "0.1em" }}>
              {t("network.persons", lang)} · {crews} {t("network.links", lang)}
            </div>
          </div>
        )}
      </div>

      {/* Graph + detail panel */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden p-4">
          {loading && (
            <div className="h-full flex items-center justify-center">
              <span className="font-data text-sm" style={{ color: "var(--text-muted)" }}>
                {t("network.building", lang)}
              </span>
            </div>
          )}
          {failed && (
            <div className="h-full flex items-center justify-center">
              <span className="text-sm" style={{ color: "var(--red)" }}>{t("network.loadFailed", lang)}</span>
            </div>
          )}
          {!loading && !failed && graph.nodes.length === 0 && (
            <div className="h-full flex items-center justify-center">
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>{t("network.empty", lang)}</span>
            </div>
          )}
          {!loading && !failed && graph.nodes.length > 0 && (
            <div style={{ height: "100%" }}>
              <NetworkGraph graph={graph} onSelect={setSelectedId} />
            </div>
          )}
        </div>

        {/* Detail panel — populated on node click */}
        {!loading && !failed && graph.nodes.length > 0 && (
          <div
            className="w-80 shrink-0 flex flex-col overflow-hidden"
            style={{ borderLeft: "1px solid var(--border)", background: "var(--bg-surface)" }}
          >
            {!selectedNode ? (
              <div className="flex-1 flex items-center justify-center p-6 text-center">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {t("network.pickNode", lang)}
                </span>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <p className="font-data text-xs font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                      {t("network.person", lang)}
                    </p>
                    {selectedNode.degree >= 3 && (
                      <span
                        className="font-data text-[0.6rem] font-bold px-1.5 py-0.5 rounded"
                        style={{ color: "var(--red)", border: "1px solid var(--red)" }}
                      >
                        KINGPIN
                      </span>
                    )}
                  </div>
                  <p className="font-display font-bold mt-1" style={{ color: "var(--text-primary)", fontSize: "1rem" }}>
                    {selectedNode.name}
                  </p>

                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {detail?.age != null && (
                      <span className="text-xs font-data" style={{ color: "var(--text-secondary)" }}>{detail.age} yrs</span>
                    )}
                    {detail?.gender && (
                      <span className="text-xs font-data" style={{ color: "var(--text-secondary)" }}>· {tv(detail.gender, lang)}</span>
                    )}
                    <span className="text-xs font-data" style={{ color: "var(--text-muted)" }}>· PID {selectedNode.id}</span>
                  </div>

                  {detail && detail.crimeGroups.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {detail.crimeGroups.map((g) => (
                        <span
                          key={g}
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
                        >
                          {tv(g, lang)}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-4 mt-2.5">
                    <div>
                      <div className="font-data font-bold" style={{ color: "var(--red)", fontSize: "1.1rem", lineHeight: 1 }}>
                        {selectedNode.caseCount}
                      </div>
                      <div className="font-data text-[0.6rem] tracking-wider" style={{ color: "var(--text-muted)" }}>CASES</div>
                    </div>
                    <div>
                      <div className="font-data font-bold" style={{ color: "var(--ink)", fontSize: "1.1rem", lineHeight: 1 }}>
                        {links.length}
                      </div>
                      <div className="font-data text-[0.6rem] tracking-wider" style={{ color: "var(--text-muted)" }}>ASSOCIATES</div>
                    </div>
                    {detail && (
                      <div>
                        <div className="font-data font-bold" style={{ color: "var(--amber)", fontSize: "1.1rem", lineHeight: 1 }}>
                          {detail.cases.filter((c) => c.arrested).length}
                        </div>
                        <div className="font-data text-[0.6rem] tracking-wider" style={{ color: "var(--text-muted)" }}>ARRESTED</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Scrollable body: connections + full case history */}
                <div className="flex-1 overflow-y-auto">
                  {/* Connections */}
                  <div className="px-4 py-2 shrink-0 sticky top-0" style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-surface)" }}>
                    <p className="font-data text-xs font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                      {t("network.connections", lang)} ({links.length})
                    </p>
                  </div>
                  {links.map(({ edge, other }) => (
                    <div key={other.id} className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{other.name}</p>
                        <span className="font-data text-xs shrink-0" style={{ color: "var(--red)" }}>
                          {edge.weight} shared
                        </span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{other.crimeGroup}</p>
                      {edge.cases && edge.cases.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {edge.cases.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => setOpenCaseId(c.id)}
                              title={c.date ? new Date(c.date).toLocaleDateString() : undefined}
                              className="font-data text-[0.65rem] px-1.5 py-0.5 rounded transition-colors"
                              style={{ background: "var(--bg-raised)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--red)"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)"; }}
                            >
                              {c.crimeNo} · {c.crimeName} ↗
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Full case history */}
                  <div className="px-4 py-2 shrink-0 sticky top-0" style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-surface)" }}>
                    <p className="font-data text-xs font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                      {t("network.caseHistory", lang)} {detail ? `(${detail.cases.length})` : ""}
                    </p>
                  </div>
                  {detailLoading && (
                    <div className="px-4 py-4">
                      <span className="text-xs font-data" style={{ color: "var(--text-muted)" }}>{t("network.loadingCases", lang)}</span>
                    </div>
                  )}
                  {detail?.cases.map((c) => {
                    const s = STATUS_STYLE[c.status] ?? { color: "var(--text-muted)", bg: "var(--bg-raised)" };
                    return (
                      <button
                        key={c.id}
                        onClick={() => setOpenCaseId(c.id)}
                        className="w-full text-left px-4 py-2.5 transition-colors"
                        style={{ borderBottom: "1px solid var(--border-subtle)" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-raised)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium font-data truncate" style={{ color: "var(--text-primary)" }}>{c.crimeNo}</span>
                          <span className="text-[0.65rem] px-1.5 py-0.5 rounded font-data font-bold shrink-0" style={{ color: s.color, background: s.bg }}>
                            {tv(c.status, lang)}
                          </span>
                        </div>
                        <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>{c.crimeName}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[0.65rem] font-data" style={{ color: "var(--text-muted)" }}>{fmtDate(c.date)}</span>
                          {c.station && <span className="text-[0.65rem] font-data" style={{ color: "var(--text-muted)" }}>· {c.station}</span>}
                          {c.arrested && (
                            <span className="text-[0.65rem] font-data font-bold" style={{ color: "var(--amber)" }}>· ARRESTED</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      {!loading && !failed && graph.nodes.length > 0 && (
        <div
          className="shrink-0 px-6 py-2 flex items-center gap-5 flex-wrap"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <LegendDot color="var(--ink)" label={t("network.legend.person", lang)} />
          <LegendDot color="var(--border)" line label={t("network.legend.shared", lang)} />
          <LegendDot color="var(--red)" ring label={t("network.legend.kingpin", lang)} />
          <p className="ml-auto text-xs font-data" style={{ color: "var(--text-muted)" }}>
            {t("network.hint", lang)}
          </p>
        </div>
      )}

      <CaseDrawer caseId={openCaseId} onClose={() => setOpenCaseId(null)} />
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
