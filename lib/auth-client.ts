"use client";
import { createAuthClient } from "@neondatabase/auth/next";

// Browser-side Neon Auth client: talks to /api/auth/[...path] (our proxy).
export const authClient = createAuthClient();

export type Posting = { role: "HQ" | "SHO"; districtId: number | null };
const POSTING_KEY = "khabri_posting";

/** Remember the posting chosen on /signup across the Google redirect. */
export function stashPosting(posting: Posting | undefined) {
  try {
    if (posting) sessionStorage.setItem(POSTING_KEY, JSON.stringify(posting));
    else sessionStorage.removeItem(POSTING_KEY);
  } catch { /* storage unavailable: the account simply starts as HQ */ }
}

export function takeStashedPosting(): Posting | undefined {
  try {
    const raw = sessionStorage.getItem(POSTING_KEY);
    sessionStorage.removeItem(POSTING_KEY);
    return raw ? (JSON.parse(raw) as Posting) : undefined;
  } catch { return undefined; }
}

/** Exchange the Neon Auth session for the app session and store the user for the dashboard shell. */
export async function completeNeonSignIn(posting?: Posting): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/auth/bridge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(posting ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.user) return { ok: false, error: data?.error ?? "Sign-in failed." };
  sessionStorage.setItem("khabri_auth", "1");
  sessionStorage.setItem("khabri_user", JSON.stringify(data.user));
  return { ok: true };
}
