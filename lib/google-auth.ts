/** Subset of the claims Google's tokeninfo endpoint returns (all values are strings). */
export type GoogleClaims = Record<string, string | undefined>;

export type GoogleIdentity = { email: string; firstName: string; lastName: string };

/**
 * Pure check of a Google ID token's claims. Returns the identity we store, or null if the
 * token is for another client, unverified, expired, or malformed. `now` is ms since epoch.
 */
export function validateGoogleClaims(claims: GoogleClaims, clientId: string, now = Date.now()): GoogleIdentity | null {
  if (!clientId || claims.aud !== clientId) return null;
  if (claims.email_verified !== "true") return null;
  const exp = Number(claims.exp);
  if (!Number.isFinite(exp) || exp * 1000 <= now) return null;
  const email = claims.email;
  if (!email) return null;
  return {
    email,
    firstName: claims.given_name || email.split("@")[0],
    lastName: claims.family_name || "",
  };
}

/** Verifies a Google ID token. Throws on network failure; returns null on any invalid token. */
export async function verifyGoogleIdToken(credential: string, clientId: string): Promise<GoogleIdentity | null> {
  // ponytail: tokeninfo endpoint; swap for google-auth-library if latency matters
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!res.ok) return null;
  return validateGoogleClaims((await res.json()) as GoogleClaims, clientId);
}
