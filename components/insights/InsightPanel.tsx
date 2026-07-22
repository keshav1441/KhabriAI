"use client";
import { useEffect, useState } from "react";
import { useChatStore } from "@/store/chat";

interface Insight {
  type: string;
  title: string;
  detail: string;
  query: string;
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  spike:          { label: "SPIKE",          color: "var(--red)"   },
  repeat_suspect: { label: "REPEAT SUSPECT", color: "var(--amber)" },
  weekly_surge:   { label: "SURGE",          color: "var(--amber)" },
  forecast:       { label: "⚠ FORECAST",     color: "var(--ink)"   },
};
const DEFAULT_CONFIG = { label: "ALERT", color: "var(--amber)" };

function nowIST() {
  return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function InsightPanel({ onQuerySelect }: { onQuerySelect: (q: string) => void }) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [time] = useState(nowIST);
  const messageCount = useChatStore((s) => s.messages.length);

  useEffect(() => {
    if (messageCount === 1) setCollapsed(true);
  }, [messageCount]);

  useEffect(() => {
    fetch("/api/insights")
      .then((r) => r.json())
      .then((d) => setInsights(d.insights ?? []))
      .catch(() => {});
  }, []);

  // Compact, varied briefing: one card per insight type, at most 3.
  const shown: Insight[] = [];
  const seenTypes = new Set<string>();
  for (const i of insights) {
    if (seenTypes.has(i.type)) continue;
    seenTypes.add(i.type);
    shown.push(i);
    if (shown.length === 3) break;
  }

  if (!shown.length) return null;

  return (
    <div className="mx-4 mt-3 rounded-md overflow-hidden" style={{ border: "1px solid var(--border)" }}>
      {/* Header bar */}
      <button
        className="w-full flex items-center justify-between px-4 py-2 transition-all"
        style={{ background: "var(--bg-surface)", borderBottom: collapsed ? "none" : "1px solid var(--border)" }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--amber)" }} />
          <span className="font-data text-xs font-bold tracking-widest uppercase" style={{ color: "var(--amber)" }}>
            Intelligence Briefing
          </span>
          <span className="font-data text-xs px-1.5 py-0.5 rounded font-bold"
                style={{ background: "var(--amber-dim)", color: "var(--amber)" }}>
            {shown.length}
          </span>
        </div>
        <span className="font-data text-xs" style={{ color: "var(--text-muted)" }}>
          {collapsed ? "▸ expand" : "▾ collapse"}
        </span>
      </button>

      {!collapsed && (
        <div className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
             style={{ background: "var(--bg-raised)" }}>
          {shown.map((insight, i) => {
            const cfg = TYPE_CONFIG[insight.type] ?? DEFAULT_CONFIG;
            return (
              <button
                key={i}
                className="text-left rounded-md p-3 transition-all"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderLeftColor: cfg.color,
                  borderLeftWidth: "3px",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-raised)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)"; }}
                onClick={() => onQuerySelect(insight.query)}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-data text-xs font-bold tracking-widest uppercase"
                        style={{ color: cfg.color }}>
                    {cfg.label}
                  </span>
                  <span className="font-data text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
                    {time} IST
                  </span>
                </div>
                <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                  {insight.title}
                </p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {insight.detail}
                </p>
                <p className="font-data text-xs mt-1.5" style={{ color: cfg.color }}>
                  → Investigate
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
