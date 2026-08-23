"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completeNeonSignIn } from "@/lib/auth-client";

// Google sign-in lands here (callbackURL). Bridge the Neon session into the app session, then go to the dashboard.
export default function NeonAuthCallback() {
  const router = useRouter();
  const [error, setError] = useState("");
  useEffect(() => {
    completeNeonSignIn().then((r) => (r.ok ? router.replace("/dashboard") : setError(r.error)));
  }, [router]);
  return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)", color: "var(--text-secondary)" }}>
      <div className="text-center space-y-3">
        <p className="font-data text-xs tracking-widest uppercase" style={{ color: error ? "var(--red)" : "var(--text-muted)" }}>
          {error ? "Sign-in failed" : "Completing sign-in…"}
        </p>
        {error && (
          <p className="text-sm">
            {error} — <a href="/login" style={{ color: "var(--ink)" }}>back to sign in</a>
          </p>
        )}
      </div>
    </main>
  );
}
