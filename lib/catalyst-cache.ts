import { getCatalystApp, withCatalystTimeout } from "./catalyst-client";

function getSegment(req?: Request) {
  const app = getCatalystApp(req);
  if (!app) return null;
  try {
    return app.cache().segment();
  } catch {
    return null;
  }
}

/** Returns null on any miss/failure/timeout — caller decides the fallback. */
export async function cacheGet(key: string, req?: Request): Promise<string | null> {
  const segment = getSegment(req);
  if (!segment) return null;
  try {
    const value = await withCatalystTimeout(segment.getValue(key));
    return value ?? null;
  } catch {
    return null;
  }
}

/** Fire-and-forget-safe: swallows failures/timeouts, never throws. */
export async function cacheSet(key: string, value: string, expiryMinutes = 60, req?: Request): Promise<void> {
  const segment = getSegment(req);
  if (!segment) return;
  try {
    await withCatalystTimeout(segment.put(key, value, expiryMinutes));
  } catch (e) {
    console.warn(`Catalyst cache write failed for key "${key}":`, (e as Error).message);
  }
}
