import { cacheGet, cacheSet } from "./catalyst-cache";

export type InsightItem = {
  type: string;
  /** English rendering. `params` is what makes the finding translatable — see
   *  lib/alertText.ts; these two stay as the fallback and the export text. */
  title: string;
  detail: string;
  /** The values behind the sentence, keyed to the `finding.<type>.*`
   *  templates in lib/i18n.ts. */
  params?: Record<string, string | number> | null;
  query: string;
  /** Where the finding sits, so the alert engine can route it to the officers
   *  posted there. null = statewide finding, relevant to everyone. */
  districtId?: number | null;
  districtName?: string | null;
  /** critical | warning | info — drives the alert badge colour. */
  severity?: "critical" | "warning" | "info";
  /** The case an MO-link finding starts from. */
  caseId?: number | null;
  /** Stable identity of the finding, used to avoid re-alerting on a re-run. */
  dedupe?: string;
};

/**
 * The cache holds the statewide set; the cut happens per officer on the way
 * out. A district-posted officer must not be handed another district's spike -
 * or, worse, the name of an accused they have no business reading. Pure, so the
 * chat tool and /api/insights can be shown to agree without a database.
 */
export function scopeInsights(insights: InsightItem[], districtId: number | null): InsightItem[] {
  if (!districtId) return insights;
  return insights.filter((i) => {
    if (i.districtId === districtId) return true;
    if (i.districtId != null) return false;
    // A statewide finding is fair game unless it names a person: the
    // repeat-accused detector deliberately nulls the district when someone is
    // active in several, and that name is still out of scope here.
    return i.type !== "repeat_suspect";
  });
}

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
