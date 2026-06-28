"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { InsightPanel } from "@/components/insights/InsightPanel";
import { MapView } from "@/components/views/MapView";
import { ReportsView } from "@/components/views/ReportsView";
import { AboutView } from "@/components/views/AboutView";
import { useTheme } from "@/components/ThemeProvider";

type View = "chat" | "map" | "reports" | "about";

const NAV_ITEMS: Array<{ icon: React.ReactNode; label: string; view: View }> = [
  { icon: <ChatIcon />, label: "Intelligence Chat", view: "chat" },
  { icon: <MapIcon />, label: "Crime Map", view: "map" },
  { icon: <ReportIcon />, label: "Case Reports", view: "reports" },
  { icon: <InfoIcon />, label: "About Project", view: "about" },
];

const QUICK_QUERIES = [
  "Top 5 districts by crime count this year",
  "All unsolved murder cases in Bengaluru",
  "Repeat offenders with 3+ cases",
  "Arrests made last 30 days by district",
];

export default function DashboardPage() {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [activeView, setActiveView] = useState<View>("chat");
  const [prefillQuery, setPrefillQuery] = useState<string | undefined>();
  const [authed, setAuthed] = useState(false);
  const [time, setTime] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (!sessionStorage.getItem("khabri_auth")) {
      router.replace("/login");
    } else {
      setAuthed(true);
    }
  }, [router]);

  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const handleInsightQuery = (q: string) => {
    setActiveView("chat");
    setPrefillQuery(q);
    setTimeout(() => setPrefillQuery(undefined), 100);
  };

  if (!authed) return null;

  const user = (() => {
    try { return JSON.parse(sessionStorage.getItem("khabri_user") ?? "{}"); }
    catch { return {}; }
  })();

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-base)" }}>
      {/* ── Sidebar ─────────────────────────────── */}
      <aside
        className="shrink-0 flex flex-col transition-all duration-200"
        style={{
          width: sidebarOpen ? "220px" : "56px",
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        {/* Logo */}
        <div
          className="shrink-0 flex items-center px-3 py-3 gap-3"
          style={{ borderBottom: "1px solid var(--border)", height: "52px" }}
        >
          <ShieldIcon size={22} />
          {sidebarOpen && (
            <div className="min-w-0">
              <div className="font-bold text-sm tracking-tight whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
                KHABRI<span style={{ color: "var(--red)" }}> AI</span>
              </div>
              <div className="font-data text-xs" style={{ color: "var(--text-muted)", lineHeight: 1 }}>
                KSP Intelligence
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = item.view === activeView;
            return (
              <button
                key={item.view}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-md transition-all text-left"
                style={{
                  background: isActive ? "var(--red-dim)" : "transparent",
                  color: isActive ? "var(--red)" : "var(--text-muted)",
                }}
                onClick={() => setActiveView(item.view)}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "var(--bg-raised)";
                    (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                  }
                }}
              >
                <span className="shrink-0">{item.icon}</span>
                {sidebarOpen && (
                  <span className="text-xs font-medium whitespace-nowrap">{item.label}</span>
                )}
              </button>
            );
          })}

          {/* Quick queries (chat view only) */}
          {sidebarOpen && activeView === "chat" && (
            <div className="pt-4">
              <p className="text-xs font-bold tracking-widest uppercase px-2 mb-2 font-data" style={{ color: "var(--text-muted)" }}>
                Quick Queries
              </p>
              <div className="space-y-0.5">
                {QUICK_QUERIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => setPrefillQuery(q)}
                    className="w-full text-left text-xs px-2 py-1.5 rounded transition-all"
                    style={{ color: "var(--text-secondary)" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--bg-raised)";
                      (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                      (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* User info */}
        <div className="shrink-0 px-3 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2.5">
            <div
              className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold"
              style={{ background: "var(--red-dim)", color: "var(--red)", border: "1px solid var(--red)" }}
            >
              {(user.firstName?.[0] ?? "O").toUpperCase()}
            </div>
            {sidebarOpen && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                  {user.firstName ? `${user.firstName} ${user.lastName ?? ""}` : "Officer"}
                </p>
                <p className="text-xs font-data truncate" style={{ color: "var(--text-muted)" }}>
                  {user.email ?? "KSP Analyst"}
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main area ───────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header
          className="shrink-0 flex items-center justify-between px-4"
          style={{ height: "52px", background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="w-8 h-8 flex items-center justify-center rounded-md transition-all"
              style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--red)"; (e.currentTarget as HTMLElement).style.color = "var(--red)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="badge-classified hidden sm:inline-flex">RESTRICTED SYSTEM</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "var(--red)", animation: "ping-slow 2s ease-in-out infinite" }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "var(--red)" }} />
              </span>
              <span className="font-data text-xs font-bold tracking-widest" style={{ color: "var(--red)" }}>LIVE</span>
            </div>

            <span className="font-data text-xs tabular-nums hidden md:block" style={{ color: "var(--text-muted)" }}>{time}</span>
            <div className="w-px h-5 hidden md:block" style={{ background: "var(--border)" }} />

            {/* Theme toggle */}
            <button
              onClick={toggle}
              className="w-8 h-8 flex items-center justify-center rounded-md transition-all"
              style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--red)"; (e.currentTarget as HTMLElement).style.color = "var(--red)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="5" />
                  <path strokeLinecap="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            <button
              className="text-xs font-medium px-3 py-1.5 rounded-md transition-all"
              style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--red)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--red)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
              onClick={() => { sessionStorage.removeItem("khabri_auth"); sessionStorage.removeItem("khabri_user"); router.push("/login"); }}
            >
              Sign out
            </button>
          </div>
        </header>

        {/* View content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {activeView === "chat" && (
            <>
              <div className="shrink-0">
                <InsightPanel onQuerySelect={handleInsightQuery} />
              </div>
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <ChatWindow prefillQuery={prefillQuery} />
              </div>
            </>
          )}
          {activeView === "map" && <MapView />}
          {activeView === "reports" && <ReportsView />}
          {activeView === "about" && <AboutView />}
        </div>
      </div>
    </div>
  );
}

/* ── Icons ─────────────────────────────────────────── */
function ShieldIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 32 36" fill="none" className="shrink-0">
      <path d="M16 1L2 7v10c0 8.5 5.9 16.5 14 18.5C24.1 33.5 30 25.5 30 17V7L16 1z" fill="var(--red)" fillOpacity="0.15" stroke="var(--red)" strokeWidth="1.5" />
      <path d="M11 18l3 3 7-7" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ChatIcon() {
  return <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>;
}
function MapIcon() {
  return <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>;
}
function InfoIcon() {
  return <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01" /></svg>;
}
function ReportIcon() {
  return <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
}
