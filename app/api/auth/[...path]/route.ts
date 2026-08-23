import { neonAuth } from "@/lib/neon-auth";

// Proxies the Neon Auth client calls (sign-in/social, email-otp/*, get-session, ...)
// to the managed Neon Auth instance. Static routes next to this (login, signup,
// logout, bridge) take precedence over the catch-all.
export const dynamic = "force-dynamic";

export const { GET, POST, PUT, DELETE, PATCH } = neonAuth.handler();
