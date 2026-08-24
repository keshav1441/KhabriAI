import { createNeonAuth } from "@neondatabase/auth/next/server";

// Edge-safe (no Prisma): imported by middleware.ts and by lib/neon-auth.ts.
// Neon's console labels the value "Auth URL"; the SDK docs call it NEON_AUTH_BASE_URL. Accept both.
export const NEON_AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL ?? process.env.NEON_AUTH_URL ?? "";
export const NEON_AUTH_COOKIE_SECRET = process.env.NEON_AUTH_COOKIE_SECRET ?? "dev-insecure-neon-auth-cookie-secret-32chars";

export const neonAuth = createNeonAuth({
  baseUrl: NEON_AUTH_BASE_URL,
  cookies: { secret: NEON_AUTH_COOKIE_SECRET },
});

export function neonAuthConfigured(): boolean {
  return Boolean(NEON_AUTH_BASE_URL);
}
