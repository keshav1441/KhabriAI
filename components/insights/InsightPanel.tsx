"use client";
import { useEffect, useState } from "react";
import { useChatStore } from "@/store/chat";

interface Insight {
  type: string;
  title: string;
  detail: string;
  query: string;
}

const TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  spike:          { icon: "▲", color: "var(--red)",   bg: "var(--red-dim)",   border: "var(--red)" },
  repeat_suspect: { icon: "⚑", color: "var(--amber)", bg: "var(--amber-dim)", border: "var(--amber)" },
  weekly_surge:   { icon: "↑", color: "var(--amber)", bg: "var(--amber-dim)", border: "var(--amber)" },
};
const DEFAULT_CONFIG = { icon: "!", color: "var(--amber)", bg: "var(--amber-dim)", border: "var(--amber)" };

export function InsightPanel({ onQuerySelect }: { onQuerySelect: (q: string) => void }) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const messageCount = useChatStore((s) => s.messages.length);

  // Auto-collapse after first message — user can still re-expand manually
  useEffect(() => {
    if (messageCount === 1) setCollapsed(true);
  }, [messageCount]);

  useEffect(() => {
    fetch("/api/insights")
      .then((r) => r.json())
      .then((d) => setInsights(d.insights ?? []))
      .catch(() => {});
  }, []);

  if (!insights.length) return null;

  return (
    <div className="mx-4 mt-3 rounded-md overflow-hidden" style={{ border: "1px solid var(--border)" }}>
      {/* Header bar */}
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 transition-all"
        style={{ background: "var(--bg-surface)", borderBottom: collapsed ? "none" : "1px solid var(--border)" }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-3">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--amber)" }}
          />
          <span
            className="text-xs font-bold tracking-widest uppercase font-data"
            style={{ color: "var(--amber)" }}
          >
            Intelligence Briefing
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded font-data font-bold"
            style={{ background: "var(--amber-dim)", color: "var(--amber)" }}
          >
            {insights.length}
          </span>
        </div>
        <span className="text-xs font-data" style={{ color: "var(--text-muted)" }}>
          {collapsed ? "▸ expand" : "▾ collapse"}
        </span>
      </button>

      {!collapsed && (
        <div
          className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
          style={{ background: "var(--bg-raised)" }}
        >
          {insights.map((insight, i) => {
            const cfg = TYPE_CONFIG[insight.type] ?? DEFAULT_CONFIG;
            return (
              <button
                key={i}
                className="text-left rounded-md p-3 transition-all group"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = cfg.border; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
                onClick={() => onQuerySelect(insight.query)}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className="w-6 h-6 rounded flex items-center justify-center text-xs shrink-0 mt-0.5 font-bold"
                    style={{ background: cfg.bg, color: cfg.color }}
                  >
                    {cfg.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                      {insight.title}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      {insight.detail}
                    </p>
                    <p
                      className="text-xs mt-1 font-data opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: cfg.color }}
                    >
                      Investigate →
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
