import { prisma } from "./db";
export { neonAuth, neonAuthConfigured } from "./neon-auth-server";

// Neon Auth (managed Better Auth) handles identity: Google (Neon's shared OAuth
// credentials) and email one-time codes. The app keeps its own KhabriUser row
// (role, district -> RLS scope) and its own session cookie; bridgeNeonUser()
// joins the two by email after a Neon sign-in.

export type BridgedUser = { firstName: string; lastName: string; email: string; role: string; districtName: string | null };

/** Find-or-create the app user for a Neon-authenticated identity. New users start as HQ (statewide). */
export type Posting = { role?: string | null; districtId?: number | string | null };

export async function bridgeNeonUser(identity: { email: string; name?: string | null }, posting?: Posting): Promise<BridgedUser> {
  const email = identity.email.trim().toLowerCase();
  const [firstName, ...rest] = (identity.name?.trim() || email.split("@")[0]).split(/\s+/);
  // The posting chosen at sign-up applies only when the account is created; an
  // existing officer's role and district are never changed by a sign-in.
  const districtId = posting?.role === "SHO" && Number(posting.districtId) > 0 ? Math.floor(Number(posting.districtId)) : null;
  const user = await prisma.khabriUser.upsert({
    where: { email },
    update: {},
    create: { email, firstName: firstName || "Officer", lastName: rest.join(" ") || "", passwordHash: null, salt: null, role: districtId ? "SHO" : "HQ", districtId },
  });
  const district = user.districtId ? await prisma.district.findUnique({ where: { DistrictID: user.districtId } }) : null;
  return { firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role, districtName: district?.DistrictName ?? null };
}
