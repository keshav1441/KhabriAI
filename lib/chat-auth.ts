import { NextRequest } from "next/server";
import { prisma, scopedClient, type Db } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/session";

export type Scope = { role: string; districtId: number | null; districtName: string | null };
export const STATEWIDE: Scope = { role: "HQ", districtId: null, districtName: null };

// Works for NextRequest and the plain Request the agent tools carry. A browser
// can send more than one khabri_session cookie (a stale one from a deleted
// account next to the live one), so every candidate is tried in order.
function sessionEmails(req: Request): string[] {
  const next = (req as { cookies?: { get?: (n: string) => { value?: string } | undefined } }).cookies;
  const fromNext = next?.get?.(SESSION_COOKIE_NAME)?.value;
  const cookie = req.headers.get("cookie") ?? "";
  // ponytail: "; *" rather than a \s escape - backslashes in template literals bit us once already.
  const tokens = [...cookie.matchAll(new RegExp("(?:^|; *)" + SESSION_COOKIE_NAME + "=([^;]+)", "g"))].map((m) => decodeURIComponent(m[1]));
  const ordered = fromNext ? [fromNext, ...tokens.filter((t) => t !== fromNext)] : tokens;
  return ordered.map((t) => verifySessionToken(t)?.email ?? null).filter((e): e is string => Boolean(e));
}

/** @internal exposed for tests */
export const sessionEmailsForTest = sessionEmails;

const scopeCache = new WeakMap<Request, Promise<Scope>>();

/** The officer's data scope for this request: statewide for HQ, one district for an SHO. Cached per request. */
export function getScope(req: Request | undefined): Promise<Scope> {
  if (!req) return Promise.resolve(STATEWIDE);
  let p = scopeCache.get(req);
  if (!p) {
    p = (async () => {
      for (const email of sessionEmails(req)) {
        const rows = await prisma.$queryRawUnsafe<{ role: string; districtId: number | null; districtName: string | null }[]>(
          `SELECT u."role", u."districtId", d."DistrictName" AS "districtName" FROM "KhabriUser" u LEFT JOIN "District" d ON d."DistrictID" = u."districtId" WHERE u."email" = $1`, email);
        const r = rows[0];
        if (!r) continue; // stale cookie for a deleted account - try the next one
        if (r.role !== "SHO" || !r.districtId) return STATEWIDE;
        return { role: r.role, districtId: r.districtId, districtName: r.districtName };
      }
      return STATEWIDE;
    })();
    scopeCache.set(req, p);
  }
  return p;
}

/** Database client for a route: every query automatically limited to the officer's scope. */
export async function scopedDb(req: Request): Promise<{ db: Db; scope: Scope }> {
  const scope = await getScope(req);
  return { db: scopedClient(scope.districtId), scope };
}

export async function getUserFromRequest(req: NextRequest) {
  const session = verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  return prisma.khabriUser.findUnique({ where: { email: session.email } });
}

/**
 * Guard for data endpoints. Returns a Response to short-circuit with (401/503)
 * or null when the request is authenticated. Keeps PII behind the session
 * cookie, matching the /api/chat guard.
 */
export async function requireUser(req: NextRequest): Promise<Response | null> {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return null;
  } catch (e) {
    console.error("auth lookup failed (restart dev server / run prisma generate):", e);
    return Response.json({ error: "Auth service unavailable" }, { status: 503 });
  }
}
