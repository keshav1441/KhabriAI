"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient, completeNeonSignIn, stashPosting, type Posting } from "@/lib/auth-client";

/**
 * Neon Auth sign-in: Google (Neon's shared OAuth credentials) or a one-time code
 * sent to the officer's email. Used on both /login and /signup; on /signup the
 * chosen posting (HQ or district) is carried through the Google redirect and
 * applied when the account is first created.
 */
export function NeonSignIn({ onError, posting, googleLabel = "Continue with Google" }: { onError: (msg: string) => void; posting?: Posting; googleLabel?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "code">("idle");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState<"" | "google" | "send" | "verify">("");

  const postingReady = () => {
    if (posting?.role === "SHO" && !posting.districtId) { onError("Select the district for a district posting first."); return false; }
    return true;
  };

  const google = async () => {
    onError("");
    if (!postingReady()) return;
    setBusy("google");
    try {
      stashPosting(posting);
      // Absolute URL: a relative callbackURL came back as "/" on the Neon side.
      const r = await authClient.signIn.social({ provider: "google", callbackURL: `${window.location.origin}/auth/callback` });
      if (r?.error) onError(r.error.message ?? "Google sign-in failed.");
    } catch { onError("Google sign-in is unavailable."); }
    finally { setBusy(""); }
  };
  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault(); onError("");
    if (!postingReady()) return;
    setBusy("send");
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
      const done = await completeNeonSignIn(posting);
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
        {busy === "google" ? "Opening Google…" : googleLabel}
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
