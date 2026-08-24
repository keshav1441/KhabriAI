import { NextRequest } from "next/server";
import { getUserFromRequest } from "./chat-auth";

/**
 * Who may see the governance surfaces — the feedback review queue and the audit
 * trail. Both show other officers' questions, so a district posting is not
 * enough: reviewing is an HQ function.
 *
 * ADMIN_EMAILS is required, not optional. Every account created from /login
 * defaults to HQ and the role arrives in the signup request body, so without
 * the list anyone who can register can read every officer's questions. Unset
 * means the governance consoles are closed to everybody.
 */
export type Reviewer = { id: number; email: string; firstName: string; lastName: string; role: string };

function allowList(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function getReviewer(req: NextRequest): Promise<Reviewer | null> {
  const list = allowList();

  // Fail closed. Signup takes the posting from the request body and anything
  // that is not "SHO" becomes HQ, so "HQ only" is not a gate at all on a
  // deployment that accepts self-registration: an attacker just registers.
  // The allowlist is the only thing standing between a new account and every
  // officer's questions, so its absence disables the consoles rather than
  // opening them.
  if (!list.length) return null;

  const user = await getUserFromRequest(req);
  if (!user) return null;
  if (user.role === "SHO") return null;
  if (!list.includes(user.email.toLowerCase())) return null;

  return { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role };
}

/** Guard for the admin routes: a Response to return, or the reviewer. */
export async function requireReviewer(
  req: NextRequest
): Promise<{ denied: Response; reviewer: null } | { denied: null; reviewer: Reviewer }> {
  try {
    const reviewer = await getReviewer(req);
    if (!reviewer) {
      // Deliberately the same answer for "not signed in" and "signed in but not
      // a reviewer": an SHO probing the URL learns nothing about who is.
      return { denied: Response.json({ error: "Not authorized" }, { status: 403 }), reviewer: null };
    }
    return { denied: null, reviewer };
  } catch (e) {
    console.error("reviewer lookup failed:", e);
    return { denied: Response.json({ error: "Auth service unavailable" }, { status: 503 }), reviewer: null };
  }
}
