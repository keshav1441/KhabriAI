"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "@/store/chat";
import { t } from "@/lib/i18n";
import { renderFinding } from "@/lib/alertText";
import { KIND_LABEL } from "@/lib/alertKinds";

interface Alert {
  id: string;
  kind: string;
  severity: "critical" | "warning" | "info" | string;
  title: string;
  detail: string;
  /** The values behind the sentence; renderFinding rebuilds it in `lang`. */
  params?: Record<string, string | number> | null;
  query: string;
  districtId: number | null;
  caseId: number | null;
  createdAt: string;
  readAt: string | null;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "var(--red)",
  warning: "var(--amber)",
  info: "var(--khaki)",
};

const POLL_MS = 60_000;

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

/**
 * Push, not pull. The detectors run on a schedule and write per-officer alert
 * rows; this polls the feed, badges what is unread, and hands a finding to the
 * chat as a ready question when the officer clicks it.
 */
export function AlertBell({ onInvestigate }: { onInvestigate: (query: string) => void }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unread, setUnread] = useState(0);
  const [last24h, setLast24h] = useState(0);
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const lang = useChatStore((s) => s.lang);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/alerts");
      if (!r.ok) return;
      const d = await r.json();
      setAlerts(d.alerts ?? []);
      setUnread(d.unread ?? 0);
      setLast24h(d.last24h ?? 0);
    } catch {
      /* offline / not signed in — the bell just stays quiet */
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Click-away close.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const markRead = async (ids?: string[]) => {
    setAlerts((prev) => prev.map((a) => (!ids || ids.includes(a.id) ? { ...a, readAt: a.readAt ?? new Date().toISOString() } : a)));
    setUnread((u) => (ids ? Math.max(0, u - ids.length) : 0));
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids ? { ids } : {}),
    }).catch(() => {});
  };

  const runDetection = async () => {
    setScanning(true);
    try {
      await fetch("/api/alerts/generate", { method: "POST" });
      await load();
    } finally {
      setScanning(false);
    }
  };

  const pick = (a: Alert) => {
    if (!a.readAt) markRead([a.id]);
    setOpen(false);
    onInvestigate(a.query || a.title);
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 flex items-center justify-center rounded-md transition-all relative hover:bg-(--bg-raised) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--khaki)"
        style={{
          color: unread ? "var(--red)" : "var(--text-secondary)",
          border: `1px solid ${unread ? "var(--red)" : "var(--border)"}`,
          background: open ? "var(--bg-raised)" : undefined,
        }}
        title={t("alerts.title", lang)}
        aria-label={t("alerts.title", lang)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 font-data text-[10px] font-bold rounded-full px-1 min-w-[16px] text-center"
            style={{ background: "var(--red)", color: "#fff", lineHeight: "16px" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 rounded-md overflow-hidden z-50"
          style={{ width: "380px", maxWidth: "90vw", background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}
        >
          {/* Briefing header */}
          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-raised)" }}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-data text-xs font-bold tracking-widest uppercase" style={{ color: "var(--red)" }}>
                {t("alerts.briefing", lang)}
              </span>
              <span className="font-data text-xs truncate" style={{ color: "var(--text-muted)" }}>
                {last24h} {t("alerts.new24h", lang)}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={runDetection}
                disabled={scanning}
                className="font-data text-[10px] tracking-wider uppercase px-1.5 py-0.5 rounded"
                style={{ color: "var(--text-secondary)", border: "1px solid var(--border)", opacity: scanning ? 0.6 : 1 }}
              >
                {scanning ? t("alerts.running", lang) : t("alerts.run", lang)}
              </button>
              {unread > 0 && (
                <button onClick={() => markRead()} className="font-data text-[10px] tracking-wider uppercase" style={{ color: "var(--text-muted)" }}>
                  {t("alerts.markAll", lang)}
                </button>
              )}
            </div>
          </div>

          {/* Feed */}
          <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
            {alerts.length === 0 && (
              <p className="px-3 py-6 text-xs text-center leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {t("alerts.empty", lang)}
              </p>
            )}
            {alerts.map((a) => {
              const color = SEVERITY_COLOR[a.severity] ?? "var(--khaki)";
              const { title, detail } = renderFinding(a, lang);
              return (
                <button
                  key={a.id}
                  onClick={() => pick(a)}
                  className="w-full text-left px-3 py-2.5 transition-all"
                  style={{
                    borderBottom: "1px solid var(--border)",
                    borderLeft: `3px solid ${color}`,
                    background: a.readAt ? "transparent" : "var(--bg-raised)",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-raised)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = a.readAt ? "transparent" : "var(--bg-raised)"; }}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-data text-[10px] font-bold tracking-widest uppercase" style={{ color }}>
                      {t(KIND_LABEL[a.kind] ?? "alerts.kind.default", lang)}
                    </span>
                    <span className="font-data text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>
                      {!a.readAt && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: color }} />}
                      {ago(a.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{title}</p>
                  <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{detail}</p>
                  <p className="font-data text-[10px] mt-1" style={{ color }}>{t("alerts.investigate", lang)}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
