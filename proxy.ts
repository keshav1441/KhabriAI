import { NextRequest, NextResponse } from "next/server";
import { neonAuth, neonAuthConfigured } from "@/lib/neon-auth-server";

// After Google sign-in, Neon Auth sends the browser back with
// ?neon_auth_session_verifier=... . Only middleware (proxy.ts in Next 16) can exchange that verifier
// for the Neon session cookie (the SDK does it inside neonAuthMiddleware), so
// this runs the exchange and then hands the user to /auth/callback, which
// bridges the Neon session into the app session and opens the dashboard.
// Route protection stays with the app's own session; nothing else is gated here.
const VERIFIER = "neon_auth_session_verifier";

const exchange = neonAuthConfigured() ? neonAuth.middleware({ loginUrl: "/login" }) : null;

export default async function proxy(req: NextRequest) {
  if (!exchange || !req.nextUrl.searchParams.has(VERIFIER)) return NextResponse.next();

  const res = await exchange(req);
  const location = res.headers.get("location");
  const exchanged = res.cookies.getAll().length > 0 && location && !new URL(location, req.url).pathname.startsWith("/login");
  if (!exchanged) {
    // Verifier without its challenge cookie (reload, expired): just show the page.
    return NextResponse.next();
  }
  const next = NextResponse.redirect(new URL("/auth/callback", req.url));
  for (const c of res.cookies.getAll()) next.cookies.set(c);
  return next;
}

export const config = {
  matcher: ["/", "/login", "/auth/callback", "/dashboard"],
};
