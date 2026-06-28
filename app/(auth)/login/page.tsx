"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
    <div
      className="min-h-screen flex"
      style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
    >
      {/* Left panel — branding */}
      <div
        className="hidden lg:flex flex-col justify-between w-[46%] p-12 relative overflow-hidden"
        style={{ background: "var(--bg-surface)", borderRight: "1px solid var(--border)" }}
      >
        {/* Background watermark */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
          style={{ opacity: 0.025 }}
        >
          <span
            className="font-data text-[22vw] font-bold tracking-widest"
            style={{ color: "var(--red)", transform: "rotate(-15deg)" }}
          >
            KSP
          </span>
        </div>

        {/* Top */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <ShieldIcon />
            <span className="badge-classified">KSP Intelligence</span>
          </div>
          <h1
            className="text-5xl font-bold leading-tight tracking-tight mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            Crime<br />Intelligence<br />Platform
          </h1>
          <p className="text-lg" style={{ color: "var(--text-secondary)" }}>
            Real-time analysis of Karnataka State Police FIR database. Ask in plain language, get instant intelligence.
          </p>
        </div>

        {/* Stats strip */}
        <div className="relative z-10 grid grid-cols-3 gap-6">
          {[
            { n: "20K+", l: "FIR Records" },
            { n: "30", l: "Districts" },
            { n: "AI", l: "Powered" },
          ].map(({ n, l }) => (
            <div key={l}>
              <div className="text-2xl font-bold font-data" style={{ color: "var(--red)" }}>{n}</div>
              <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="relative z-10" style={{ borderTop: "1px solid var(--border)", paddingTop: "1.5rem" }}>
          <p className="text-xs font-data" style={{ color: "var(--text-muted)" }}>
            KSP × Hack2skill · Datathon 2026 · RESTRICTED SYSTEM
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 lg:p-16 animate-fade-up">
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
              style={{
                background: loading ? "var(--red-dim)" : "var(--red)",
                color: "#fff",
                border: "none",
              }}
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
              <Link href="/signup" style={{ color: "var(--red)" }} className="hover:underline font-medium">
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
            onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--red)"; }}
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
