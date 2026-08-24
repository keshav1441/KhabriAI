import { NextRequest } from "next/server";
import { requireReviewer } from "@/lib/admin-auth";
import { dataQualityReport } from "@/lib/data-quality";
import { cacheGet, cacheSet } from "@/lib/catalyst-cache";

export const dynamic = "force-dynamic";

// Thirteen full-table scans over 20k cases, and the answer only moves when the
// case data does — which is a nightly load, not a page view. Cached like the
// hotspot forecast; ?refresh=1 is the way past it when a reviewer has just had
// a correction applied and wants to see it land.
const TTL_MINUTES = 60;
const CACHE_KEY = "data-quality:v1";

/** The state of the FIR records themselves — reviewer-gated like its siblings. */
export async function GET(req: NextRequest) {
  const { denied } = await requireReviewer(req);
  if (denied) return denied;

  const refresh = req.nextUrl.searchParams.get("refresh") === "1";

  try {
    const cached = refresh ? null : await cacheGet(CACHE_KEY, req);
    const report = cached
      ? (JSON.parse(cached) as Awaited<ReturnType<typeof dataQualityReport>>)
      : await dataQualityReport();
    if (!cached) await cacheSet(CACHE_KEY, JSON.stringify(report), TTL_MINUTES, req);

    return Response.json({ report, cached: Boolean(cached) });
  } catch (e) {
    console.error("data quality report failed:", e);
    return Response.json({ error: "Could not audit the case data" }, { status: 500 });
  }
}
