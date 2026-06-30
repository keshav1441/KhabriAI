"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const DEMO_QUERY = "Show unsolved homicides in Bengaluru Urban, last 90 days";
const DEMO_SQL = `SELECT c.case_number, c.crime_type,
  c.station_name, c.date_of_occurrence
FROM cases c
WHERE c.district = 'Bengaluru Urban'
  AND c.crime_type ILIKE '%murder%'
  AND c.chargesheet_filed = false
  AND c.date_of_occurrence
      >= NOW() - INTERVAL '90 days'
ORDER BY c.date_of_occurrence DESC;`;
const DEMO_ROWS = [
  ["BLR/2024/2847", "Shivajinagar", "14 Dec 2024"],
  ["BLR/2024/2901", "Cubbon Park",  "08 Dec 2024"],
  ["BLR/2024/3012", "Indiranagar",  "29 Nov 2024"],
];

type Phase = "typing" | "generating" | "sql" | "results" | "pause";

function TerminalDemo() {
  const [phase, setPhase] = useState<Phase>("typing");
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      if (typed < DEMO_QUERY.length) {
        t = setTimeout(() => setTyped((n) => n + 1), 38);
      } else {
        t = setTimeout(() => setPhase("generating"), 700);
      }
    } else if (phase === "generating") {
      t = setTimeout(() => setPhase("sql"), 1200);
    } else if (phase === "sql") {
      t = setTimeout(() => setPhase("results"), 900);
    } else if (phase === "results") {
      t = setTimeout(() => setPhase("pause"), 3500);
    } else {
      t = setTimeout(() => { setTyped(0); setPhase("typing"); }, 1500);
    }
    return () => clearTimeout(t);
  }, [phase, typed]);

  return (
    <div className="h-full overflow-hidden text-xs"
         style={{ background: "var(--bg-base)" }}>
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 px-3 py-2"
           style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#FF5F56" }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#FFBD2E" }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#27C93F" }} />
        <span className="ml-2 font-data" style={{ color: "var(--text-muted)" }}>khabri — intel terminal</span>
      </div>
      {/* Body */}
      <div className="p-4 font-data space-y-3 overflow-y-auto" style={{ maxHeight: "calc(100% - 36px)" }}>
        {/* Prompt line */}
        <div>
          <span style={{ color: "var(--khaki)" }}>ksp@intel</span>
          <span style={{ color: "var(--text-muted)" }}>:~$ </span>
          <span style={{ color: "var(--text-primary)" }}>{DEMO_QUERY.slice(0, typed)}</span>
          {phase === "typing" && <span className="cursor-blink" />}
        </div>
        {/* Generating state */}
        {phase === "generating" && (
          <div style={{ color: "var(--amber)" }}>
            ⟳ Generating SQL...
          </div>
        )}
        {/* SQL block */}
        {(phase === "sql" || phase === "results") && (
          <pre className="text-xs leading-relaxed overflow-hidden"
               style={{ color: "var(--green)" }}>
            {DEMO_SQL}
          </pre>
        )}
        {/* Results */}
        {phase === "results" && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
            <div className="mb-1.5" style={{ color: "var(--text-muted)" }}>→ 3 results · 74ms</div>
            <table className="w-full">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <th className="text-left font-normal pb-1 pr-4">CASE NO.</th>
                  <th className="text-left font-normal pb-1 pr-4">STATION</th>
                  <th className="text-left font-normal pb-1">DATE</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_ROWS.map(([no, station, date]) => (
                  <tr key={no}>
                    <td className="py-0.5 pr-4" style={{ color: "var(--red)" }}>{no}</td>
                    <td className="py-0.5 pr-4" style={{ color: "var(--text-primary)" }}>{station}</td>
                    <td className="py-0.5" style={{ color: "var(--text-muted)" }}>{date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed.");
      } else {
        sessionStorage.setItem("khabri_auth", "1");
        sessionStorage.setItem("khabri_user", JSON.stringify(data.user));
        router.push("/dashboard");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      {/* Left panel — branding + terminal demo */}
      <div
        className="hidden lg:flex flex-col w-[48%] p-10 gap-8 relative overflow-hidden"
        style={{ background: "var(--bg-surface)", borderRight: "1px solid var(--border)" }}
      >
        {/* Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
             style={{ opacity: 0.018 }}>
          <span className="font-display font-bold"
                style={{ fontSize: "28vw", color: "var(--text-primary)", transform: "rotate(-12deg)", letterSpacing: "-0.05em" }}>
            KSP
          </span>
        </div>

        {/* Top: logo + headline */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-10">
            <ShieldIcon />
            <span className="badge-classified">KSP Intelligence</span>
          </div>
          <h1 className="font-display font-bold leading-none tracking-tight mb-4 uppercase"
              style={{ fontSize: "clamp(2.5rem, 4.5vw, 3.75rem)", color: "var(--text-primary)" }}>
            Crime<br />Intelligence<br />Platform
          </h1>
          <p className="text-sm leading-relaxed max-w-xs" style={{ color: "var(--text-secondary)" }}>
            Ask in plain English. Get instant intelligence from the live KSP FIR database — SQL-powered, streamed in real time.
          </p>
        </div>

        {/* Terminal demo — flex-1 so it fills remaining space, clips if short */}
        <div className="relative z-10 flex-1 min-h-0 flex flex-col">
          <p className="font-data text-xs tracking-widest uppercase mb-2 shrink-0" style={{ color: "var(--text-muted)" }}>
            Live demo ↓
          </p>
          <div className="flex-1 min-h-0 overflow-hidden rounded-md" style={{ border: "1px solid var(--border)" }}>
            <TerminalDemo />
          </div>
        </div>

        {/* Bottom attribution */}
        <div className="relative z-10 shrink-0" style={{ borderTop: "1px solid var(--border)", paddingTop: "1.25rem" }}>
          <p className="font-data text-xs" style={{ color: "var(--text-muted)" }}>
            KSP × Hack2skill · Datathon 2026 · RESTRICTED SYSTEM
          </p>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 lg:p-16 overflow-y-auto animate-fade-up">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <ShieldIcon />
            <span className="badge-classified">KSP Intelligence</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight mb-1" style={{ color: "var(--text-primary)" }}>
              Officer Access
            </h2>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Authenticate to access the intelligence system
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Email Address">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="officer@ksp.gov.in"
                autoComplete="email"
                required
              />
            </Field>

            <Field label="Password">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
              />
            </Field>

            {error && (
              <div
                className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-md"
                style={{ background: "var(--red-dim)", border: "1px solid var(--red)", color: "var(--red)" }}
              >
                <span>⚠</span> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-3 rounded-md text-sm font-semibold tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: loading ? "var(--ink-dim)" : "var(--ink)", color: "#fff", border: "none" }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner /> Authenticating...
                </span>
              ) : (
                "Sign In →"
              )}
            </button>
          </form>

          <div style={{ borderTop: "1px solid var(--border)", marginTop: "1.5rem", paddingTop: "1.5rem" }}>
            <p className="text-sm text-center" style={{ color: "var(--text-muted)" }}>
              New officer?{" "}
              <Link href="/signup" style={{ color: "var(--ink)" }} className="hover:underline font-medium">
                Create account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactElement }) {
  const child = children as React.ReactElement<React.InputHTMLAttributes<HTMLInputElement>>;
  return (
    <div>
      <label
        className="block text-xs font-medium mb-1.5 tracking-wider uppercase"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </label>
      {child.type === "input"
        ? (
          <input
            {...child.props}
            className="w-full rounded-md px-4 py-3 text-sm font-data transition-all outline-none"
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
            onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--ink)"; }}
            onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--border)"; }}
          />
        )
        : children}
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg width="32" height="36" viewBox="0 0 32 36" fill="none">
      <path
        d="M16 1L2 7v10c0 8.5 5.9 16.5 14 18.5C24.1 33.5 30 25.5 30 17V7L16 1z"
        fill="var(--red)"
        fillOpacity="0.15"
        stroke="var(--red)"
        strokeWidth="1.5"
      />
      <path
        d="M11 18l3 3 7-7"
        stroke="var(--red)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
