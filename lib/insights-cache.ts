import { cacheGet, cacheSet } from "./catalyst-cache";

export type InsightItem = { type: string; title: string; detail: string; query: string };

const INSIGHTS_CACHE_KEY = "insights:latest";
const INSIGHTS_CACHE_TTL_MINUTES = 180; // matches the Phase 3 cron interval

export async function getCachedInsights(req?: Request): Promise<InsightItem[] | null> {
  const raw = await cacheGet(INSIGHTS_CACHE_KEY, req);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as InsightItem[];
  } catch {
    return null;
  }
}

export async function setCachedInsights(insights: InsightItem[], req?: Request): Promise<void> {
  await cacheSet(INSIGHTS_CACHE_KEY, JSON.stringify(insights), INSIGHTS_CACHE_TTL_MINUTES, req);
}
