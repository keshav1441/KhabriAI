import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE_NAME = "khabri_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

if (!process.env.SESSION_SECRET) {
  console.warn(
    "SESSION_SECRET is not set — using an insecure development fallback. Set SESSION_SECRET before deploying to production."
  );
}
const SECRET = process.env.SESSION_SECRET ?? "dev-insecure-session-secret-change-me";

function sign(payloadB64: string): string {
  return createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
}

export function createSessionToken(email: string): string {
  const payloadB64 = Buffer.from(JSON.stringify({ email, exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 })).toString(
    "base64url"
  );
  return `${payloadB64}.${sign(payloadB64)}`;
}

/** Verifies the HMAC signature and expiry — returns null on any tamper/expiry/malformed input. */
export function verifySessionToken(token: string | undefined | null): { email: string } | null {
  if (!token) return null;
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;

  const expectedSig = Buffer.from(sign(payloadB64));
  const givenSig = Buffer.from(signature);
  if (expectedSig.length !== givenSig.length || !timingSafeEqual(expectedSig, givenSig)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (typeof payload.email !== "string" || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}
