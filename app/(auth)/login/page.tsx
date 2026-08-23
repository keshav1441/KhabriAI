"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TerminalDemo, ShieldIcon } from "@/components/marketing/TerminalDemo";
import { authClient, completeNeonSignIn } from "@/lib/auth-client";

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

          <NeonSignIn onError={setError} />

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

/** Neon Auth: Google (Neon's shared OAuth credentials) or a one-time code sent to the officer's email. */
function NeonSignIn({ onError }: { onError: (msg: string) => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "code">("idle");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState<"" | "google" | "send" | "verify">("");

  const google = async () => {
    onError(""); setBusy("google");
    try {
      const r = await authClient.signIn.social({ provider: "google", callbackURL: "/auth/callback" });
      if (r?.error) onError(r.error.message ?? "Google sign-in failed.");
    } catch { onError("Google sign-in is unavailable."); }
    finally { setBusy(""); }
  };
  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault(); onError(""); setBusy("send");
    try {
      const r = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
      if (r?.error) onError(r.error.message ?? "Could not send the code.");
      else setMode("code");
    } catch { onError("Could not send the code."); }
    finally { setBusy(""); }
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); onError(""); setBusy("verify");
    try {
      const r = await authClient.signIn.emailOtp({ email, otp });
      if (r?.error) { onError(r.error.message ?? "Invalid code."); return; }
      const done = await completeNeonSignIn();
      if (!done.ok) { onError(done.error); return; }
      router.push("/dashboard");
    } catch { onError("Verification failed."); }
    finally { setBusy(""); }
  };

  const box: React.CSSProperties = { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" };
  return (
    <div className="mt-5 space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
        <span className="font-data text-[10px] tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>or</span>
        <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
      </div>
      <button type="button" onClick={google} disabled={busy !== ""}
        className="w-full rounded-md px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7a14.5 14.5 0 010-9.4l-7.8-6A24 24 0 000 24c0 3.9.9 7.5 2.6 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.8 6C6.5 42.6 14.6 48 24 48z"/></svg>
        {busy === "google" ? "Opening Google…" : "Continue with Google"}
      </button>
      {mode === "idle" ? (
        <form onSubmit={sendCode} className="flex gap-2">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="officer@ksp.gov.in"
            className="flex-1 rounded-md px-3 py-2.5 text-sm font-data outline-none" style={box} />
          <button type="submit" disabled={busy !== ""} className="rounded-md px-4 py-2.5 text-sm font-medium disabled:opacity-60"
            style={{ background: "var(--ink)", color: "white" }}>{busy === "send" ? "Sending…" : "Email me a code"}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-2">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>We sent a 6-digit code to <span className="font-data">{email}</span>.</p>
          <div className="flex gap-2">
            <input inputMode="numeric" autoComplete="one-time-code" required value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="123456" maxLength={8} className="flex-1 rounded-md px-3 py-2.5 text-sm font-data tracking-[0.3em] outline-none" style={box} />
            <button type="submit" disabled={busy !== "" || otp.length < 4} className="rounded-md px-4 py-2.5 text-sm font-medium disabled:opacity-60"
              style={{ background: "var(--ink)", color: "white" }}>{busy === "verify" ? "Verifying…" : "Verify"}</button>
          </div>
          <button type="button" onClick={() => { setMode("idle"); setOtp(""); }} className="text-xs hover:underline" style={{ color: "var(--text-muted)" }}>Use a different email</button>
        </form>
      )}
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

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
