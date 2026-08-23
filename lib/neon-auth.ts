import { createNeonAuth } from "@neondatabase/auth/next/server";
import { prisma } from "./db";

// Neon Auth (managed Better Auth) handles identity: Google (Neon's shared OAuth
// credentials) and email one-time codes. The app keeps its own KhabriUser row
// (role, district -> RLS scope) and its own session cookie; bridgeNeonUser()
// joins the two by email after a Neon sign-in.
// Neon's console labels it "Auth URL"; the SDK docs call it NEON_AUTH_BASE_URL. Accept both.
const BASE_URL = process.env.NEON_AUTH_BASE_URL ?? process.env.NEON_AUTH_URL ?? "";

export const neonAuth = createNeonAuth({
  baseUrl: BASE_URL,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET ?? "dev-insecure-neon-auth-cookie-secret-32chars" },
});

export function neonAuthConfigured(): boolean {
  return Boolean(BASE_URL);
}

export type BridgedUser = { firstName: string; lastName: string; email: string; role: string; districtName: string | null };

/** Find-or-create the app user for a Neon-authenticated identity. New users start as HQ (statewide). */
export async function bridgeNeonUser(identity: { email: string; name?: string | null }): Promise<BridgedUser> {
  const email = identity.email.trim().toLowerCase();
  const [firstName, ...rest] = (identity.name?.trim() || email.split("@")[0]).split(/\s+/);
  const user = await prisma.khabriUser.upsert({
    where: { email },
    update: {},
    create: { email, firstName: firstName || "Officer", lastName: rest.join(" ") || "", passwordHash: null, salt: null },
  });
  const district = user.districtId ? await prisma.district.findUnique({ where: { DistrictID: user.districtId } }) : null;
  return { firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role, districtName: district?.DistrictName ?? null };
}
