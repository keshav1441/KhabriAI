import catalyst from "zcatalyst-sdk-node";

type CatalystApp = ReturnType<typeof catalyst.initialize>;

/**
 * Request-scoped Catalyst app instance. Zoho's AppSail proxy injects the
 * project-context headers this reads (project id/key/environment) into every
 * request that reaches the app once deployed on Catalyst, so this works with
 * zero extra credential config in production. In local dev (`next dev`, not
 * behind Catalyst's proxy) those headers are absent, so init throws
 * synchronously and callers must fall back to local behavior.
 */
export function getCatalystApp(req?: Request): CatalystApp | null {
  if (!req) return null;
  try {
    const headers = Object.fromEntries(req.headers.entries());
    return catalyst.initialize({ headers });
  } catch (e) {
    console.warn("Catalyst SDK init unavailable (expected outside AppSail) — using local fallbacks:", (e as Error).message);
    return null;
  }
}

const DEFAULT_CATALYST_TIMEOUT_MS = 3000;

/**
 * Catalyst network calls have no built-in timeout — a slow/unreachable
 * endpoint (bad token, blocked egress) would otherwise hang the caller
 * indefinitely, which breaks the "non-blocking" guarantee for every
 * Catalyst-backed feature (cache, audit log).
 */
export function withCatalystTimeout<T>(promise: Promise<T>, ms = DEFAULT_CATALYST_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Catalyst call timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}
