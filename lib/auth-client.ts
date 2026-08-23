"use client";
import { createAuthClient } from "@neondatabase/auth/next";

// Browser-side Neon Auth client: talks to /api/auth/[...path] (our proxy).
export const authClient = createAuthClient();

/** Exchange the Neon Auth session for the app session and store the user for the dashboard shell. */
export async function completeNeonSignIn(): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/auth/bridge", { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.user) return { ok: false, error: data?.error ?? "Sign-in failed." };
  sessionStorage.setItem("khabri_auth", "1");
  sessionStorage.setItem("khabri_user", JSON.stringify(data.user));
  return { ok: true };
}
