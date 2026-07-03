"use client";
import { useState } from "react";
import { CaseDrawer } from "../viz/CaseDrawer";
import type { RelatedCase } from "@/store/chat";

export function RelatedCases({ cases }: { cases?: RelatedCase[] }) {
  const [activeCaseId, setActiveCaseId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  if (!cases || cases.length === 0) return null;

  return (
    <>
      <div className="rounded-md overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <button
          className="w-full flex items-center justify-between px-3 py-2 transition-all"
          style={{ background: "var(--bg-surface)", borderBottom: open ? "1px solid var(--border)" : "none" }}
          onClick={() => setOpen((o) => !o)}
        >
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--amber)" }} />
            <span className="font-data text-xs font-bold tracking-widest uppercase" style={{ color: "var(--amber)" }}>
              Related Cases
            </span>
            <span
              className="font-data text-xs px-1.5 py-0.5 rounded font-bold"
              style={{ background: "var(--amber-dim)", color: "var(--amber)" }}
            >
              {cases.length}
            </span>
          </div>
          <span className="font-data text-xs" style={{ color: "var(--text-muted)" }}>
            {open ? "▾ collapse" : "▸ expand"}
          </span>
        </button>

        {open && (
          <div className="p-2.5 grid gap-1.5 sm:grid-cols-2" style={{ background: "var(--bg-raised)" }}>
            {cases.map((c) => (
              <button
                key={c.id}
                className="text-left rounded-md p-2.5 transition-all"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderLeftColor: "var(--amber)",
                  borderLeftWidth: "3px",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-raised)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)"; }}
                onClick={() => setActiveCaseId(c.id)}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-data text-xs font-bold" style={{ color: "var(--text-muted)" }}>
                    {c.crimeNo ?? `Case #${c.id}`}
                  </span>
                  <span
                    className="font-data text-xs px-1.5 py-0.5 rounded font-bold shrink-0"
                    style={{ background: "var(--amber-dim)", color: "var(--amber)" }}
                  >
                    {(c.score * 100).toFixed(0)}% match
                  </span>
                </div>
                {(c.crimeGroup || c.district) && (
                  <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    {[c.crimeGroup, c.district].filter(Boolean).join(" · ")}
                  </p>
                )}
                {c.briefFacts && (
                  <p className="text-xs mt-0.5 leading-relaxed line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                    {c.briefFacts}
                  </p>
                )}
                <p className="font-data text-xs mt-1.5" style={{ color: "var(--amber)" }}>
                  → Open case file
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <CaseDrawer caseId={activeCaseId} onClose={() => setActiveCaseId(null)} />
    </>
  );
}
