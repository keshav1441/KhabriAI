"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { TerminalDemo, ShieldIcon } from "@/components/marketing/TerminalDemo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const signIn = async (url: string, body: Record<string, string>) => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    signIn("/api/auth/login", { email, password });
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

          {GOOGLE_CLIENT_ID && (
            <GoogleButton onCredential={(credential) => signIn("/api/auth/google", { credential })} />
          )}

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

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

// ponytail: minimal GIS surface we touch; full typings live in @types/google.accounts if ever needed
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, o: Record<string, string | number>) => void;
        };
      };
    };
  }
}

/** Google Identity Services button - only rendered when NEXT_PUBLIC_GOOGLE_CLIENT_ID is set. */
function GoogleButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential; // parent passes a fresh arrow each render; keep GIS init to once
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready || !ref.current || !window.google) return;
    window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID!, callback: (r) => cb.current(r.credential) });
    window.google.accounts.id.renderButton(ref.current, {
      theme: document.documentElement.dataset.theme === "dark" ? "filled_black" : "outline",
      size: "large",
      width: ref.current.offsetWidth,
      text: "signin_with",
    });
  }, [ready]);

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setReady(true)} />
      <div className="flex items-center gap-3 my-5">
        <span className="flex-1" style={{ borderTop: "1px solid var(--border)" }} />
        <span className="font-data text-xs tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>or</span>
        <span className="flex-1" style={{ borderTop: "1px solid var(--border)" }} />
      </div>
      <div ref={ref} className="w-full flex justify-center" style={{ minHeight: 40 }} />
    </>
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

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
