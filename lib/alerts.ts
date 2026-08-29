import { prisma } from "./db";
import { computeInsights } from "./insights-compute";
import { scanDuplicates } from "./duplicate-detect";
import { english } from "./alertText";
import { t, tf } from "./i18n";
import type { Lang } from "@/store/chat";
import type { InsightItem } from "./insights-cache";

/**
 * Proactive early warning.
 *
 * The dashboard's insight panel is pull: it only exists while an officer is
 * looking at it. This is push — the same anomaly / forecast detectors plus a
 * cross-district modus-operandi linker run on a schedule, and every finding is
 * fanned out as an Alert row to the officers whose scope it falls in. An SHO
 * sees their district's findings and statewide ones; HQ sees everything.
 *
 * Dedupe: each finding carries a stable key (district + the numbers behind
 * it), unique per user, so re-running the job does not re-notify. A finding is
 * new only when the underlying numbers move.
 */

export type AlertRow = {
  id: string;
  kind: string;
  severity: string;
  title: string;
  detail: string;
  /** Rendered into the reader's language by lib/alertText.ts. Null on rows
   *  written before findings became translatable. */
  params: Record<string, string | number> | null;
  query: string;
  districtId: number | null;
  caseId: number | null;
  createdAt: Date;
  readAt: Date | null;
};

export type Candidate = InsightItem & { dedupe: string; severity: "critical" | "warning" | "info" };

export type AlertInsert = {
  userId: number;
  kind: string;
  severity: string;
  title: string;
  detail: string;
  /** Omitted, not null: Prisma writes SQL NULL for an absent Json field but
   *  rejects a literal `null` (that is `Prisma.DbNull`). */
  params?: Record<string, string | number>;
  query: string;
  districtId: number | null;
  caseId: number | null;
  dedupeKey: string;
};

/**
 * The outlier bar for an MO alert, and why it is this high.
 *
 * The old value was 0.72, which filtered nothing at all: measured 2026-08-25
 * over the live corpus, the closest CROSS-DISTRICT narrative to a random case
 * scores min .862, p05 .890, median .918, p95 .942, p99 .953. Every case in the
 * state has a cross-district "match" above .72, above .78, and above .86. The
 * detector therefore fired its full quota of five critical alerts every run,
 * each announcing a "92% narrative match" that was merely the median.
 *
 * There is no cut that separates a real link from a coincidence — series pairs
 * and unrelated same-group pairs overlap almost entirely (see
 * SIMILAR_CASE_MIN_SCORE in lib/case-retrieval.ts). So this is not a confidence
 * gate; it is an OUTLIER test against the distribution above. At .95 — just
 * under p99 — 1.4% of cases have a cross-district neighbour that close, which
 * is what "unusual enough to interrupt an officer" has to mean if the word is
 * to keep any meaning. Corroboration is required on top (see MO_SAME_SUBHEAD).
 *
 * Effect on the live alert path, same 60-case scan window: at 0.72, 60 of 60
 * recent cases produced a finding and the job emitted its cap of five critical
 * alerts every run. At 0.95 with the sub-head requirement, 2 of 60 do.
 */
export const MO_MIN_SCORE = Number(process.env.ALERT_MO_MIN_SCORE ?? 0.95);
/**
 * The second signal. A narrative closeness alone — however extreme — is one
 * measurement of one axis, and an alert that rests on it is an alert that fires
 * on prose style. Requiring the two files to share a crime sub-head means the
 * finding is "the same offence, described almost identically, in two districts"
 * rather than "two texts that read alike". Neighbours agree on crime GROUP 96%
 * of the time in this corpus and on sub-head 67%, so the sub-head is the one
 * that adds information.
 */
export const MO_SAME_SUBHEAD = process.env.ALERT_MO_SAME_SUBHEAD !== "false";
export const MO_RECENT_DAYS = Number(process.env.ALERT_MO_RECENT_DAYS ?? 30);
export const MO_SCAN_CASES = 60; // how many recent narratives to link-check per run
const MO_MAX_ALERTS = 5;

/**
 * The link a single station cannot make: a case registered in the last few
 * weeks whose narrative is closest to a case in a *different* district. One
 * LATERAL nearest-neighbour lookup per recent case, served by the pgvector
 * HNSW index. Narratives never name the accused, so a hit means the method
 * matches, not the people.
 *
 * Two gates, both necessary, neither sufficient on its own: the match has to be
 * an outlier against the corpus's own cross-district nearest-neighbour
 * distribution (MO_MIN_SCORE) AND the two files have to be the same offence
 * sub-head (MO_SAME_SUBHEAD). An alert that fires on every recent case — which
 * is exactly what this did — is worse than no alert.
 */
async function computeMoLinkAlerts(): Promise<Candidate[]> {
  const rows = await prisma.$queryRawUnsafe<
    {
      case_id: number; crime_no: string | null; district_id: number; district_name: string;
      crime_group: string | null; registered: string | null;
      match_id: number; match_crime_no: string | null; match_district_id: number;
      match_district_name: string; score: number;
    }[]
  >(
    `WITH recent AS (
       SELECT cm."CaseMasterID" AS case_id, cm."CrimeNo" AS crime_no,
              cm."BriefFactsEmbedding" AS e, cm."CrimeMinorHeadID" AS sub_head,
              d."DistrictID" AS district_id, d."DistrictName" AS district_name,
              ch."CrimeGroupName" AS crime_group,
              to_char(cm."CrimeRegisteredDate", 'YYYY-MM-DD') AS registered
       FROM "CaseMaster" cm
       JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
       JOIN "District" d ON d."DistrictID" = u."DistrictID"
       LEFT JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
       WHERE cm."BriefFactsEmbedding" IS NOT NULL
         AND cm."CrimeRegisteredDate" >= NOW() - ($1 || ' days')::interval
       ORDER BY cm."CrimeRegisteredDate" DESC
       LIMIT $2
     )
     SELECT r.case_id, r.crime_no, r.district_id, r.district_name, r.crime_group, r.registered,
            m.match_id, m.match_crime_no, m.match_district_id, m.match_district_name, m.score
     FROM recent r
     CROSS JOIN LATERAL (
       SELECT cm2."CaseMasterID" AS match_id, cm2."CrimeNo" AS match_crime_no,
              d2."DistrictID" AS match_district_id, d2."DistrictName" AS match_district_name,
              1 - (cm2."BriefFactsEmbedding" <=> r.e) AS score
       FROM "CaseMaster" cm2
       JOIN "Unit" u2 ON u2."UnitID" = cm2."PoliceStationID"
       JOIN "District" d2 ON d2."DistrictID" = u2."DistrictID"
       WHERE cm2."BriefFactsEmbedding" IS NOT NULL
         AND cm2."CaseMasterID" <> r.case_id
         AND d2."DistrictID" <> r.district_id
         AND ($5::boolean IS NOT TRUE OR cm2."CrimeMinorHeadID" IS NOT DISTINCT FROM r.sub_head)
       ORDER BY cm2."BriefFactsEmbedding" <=> r.e
       LIMIT 1
     ) m
     WHERE m.score >= $3
     ORDER BY m.score DESC
     LIMIT $4`,
    String(Math.floor(MO_RECENT_DAYS)),
    MO_SCAN_CASES,
    MO_MIN_SCORE,
    MO_MAX_ALERTS,
    MO_SAME_SUBHEAD
  );

  const out: Candidate[] = [];
  for (const r of rows) {
    const label = r.crime_no ?? `case ${r.case_id}`;
    const matchLabel = r.match_crime_no ?? `case ${r.match_id}`;
    // No percentage in the wording. The cosine is not calibrated
    // (lib/case-retrieval.ts), so what is claimed is what was measured: this
    // pair is an outlier against the corpus's own distribution, and the two
    // files are the same offence.
    const moParams = {
      label,
      matchLabel,
      // "Case" and "recent" are placeholders for a missing crime group or
      // date; both are in the value map, so they translate like any other
      // reference value rather than freezing as English.
      crimeGroup: r.crime_group ?? "Case",
      district: r.district_name,
      matchDistrict: r.match_district_name,
      registered: r.registered ?? "recent",
    };
    const base = {
      type: "mo_link",
      ...english("mo_link", moParams),
      params: moParams,
      query: `Find cases with the same modus operandi as FIR ${r.crime_no ?? r.case_id}`,
      caseId: r.case_id,
      // Downgraded from "critical". A narrative lead worth an hour is not an
      // emergency, and reserving the top severity for findings that earn it is
      // the only thing that keeps it readable.
      severity: "warning" as const,
    };
    // One finding, two districts that each need to know about it.
    out.push({ ...base, districtId: r.district_id, districtName: r.district_name, dedupe: `mo:${r.case_id}:${r.match_id}` });
    out.push({ ...base, districtId: r.match_district_id, districtName: r.match_district_name, dedupe: `mo:${r.case_id}:${r.match_id}` });
  }
  return out;
}

const DUP_MAX_ALERTS = 5;

/**
 * The other half of the MO linker. That one finds different crimes by the same
 * crew; this finds one crime with two files — an incident reported again at the
 * next station, or re-entered at the same one. Nobody notices from inside a
 * single station's register, and both files carry on consuming investigation
 * time until someone does.
 *
 * Bounded the same way: recent registrations only, capped, and the scoring
 * refuses to assert without a matching complainant or victim.
 */
async function computeDuplicateAlerts(): Promise<Candidate[]> {
  const hits = await scanDuplicates({ maxPairs: DUP_MAX_ALERTS });

  const out: Candidate[] = [];
  for (const h of hits) {
    const pct = Math.round(h.likelihood * 100);
    const label = h.crimeNo ?? `case ${h.caseId}`;
    const matchLabel = h.matchCrimeNo ?? `case ${h.matchId}`;
    const whereParams = {
      station: h.station ?? h.districtName,
      matchStation: h.matchStation ?? h.matchDistrictName,
    };
    const where = (lang: Lang) =>
      tf(h.sameStation ? "finding.duplicate.bothAt" : "finding.duplicate.across", lang, whereParams);
    // The people reason carries a complainant or victim's actual name. That name
    // belongs to one of the two files, so it must not be written into the other
    // district's alert row - the pair of CrimeNos is enough to act on either
    // side, and the officer who owns the file can see the name in it.
    const reasonText = (withName: boolean, lang: Lang) =>
      h.reasons
        .filter((r) => withName || r.signal !== "people")
        .map((r) => (lang === "kn" ? r.labelKn : r.label.toLowerCase()))
        .join("; ");
    // Both languages are rendered here, not at read time: the reason clause is
    // built from signal values this row does not carry (see DuplicateReason).
    const dupParams = (withName: boolean) => ({
      label,
      matchLabel,
      registered: h.registered ?? "recent",
      matchRegistered: h.matchRegistered ?? "recent",
      pct,
      where: where("en"),
      whereKn: where("kn"),
      why: reasonText(withName, "en") || t("finding.duplicate.reasonFallback", "en"),
      whyKn: reasonText(withName, "kn") || t("finding.duplicate.reasonFallback", "kn"),
      ...(withName ? {} : { unnamed: 1 }),
    });
    const nearParams = dupParams(true);
    const base = {
      type: "duplicate",
      ...english("duplicate", nearParams),
      params: nearParams,
      query: `Compare FIR ${h.crimeNo ?? h.caseId} and FIR ${h.matchCrimeNo ?? h.matchId} — are these the same incident filed twice?`,
      caseId: h.caseId,
      // Near-certain wastes two investigations and double-counts the crime
      // statistics; merely probable is a question for the IO, not an emergency.
      severity: (h.likelihood >= 0.85 ? "critical" : "warning") as "critical" | "warning",
    };
    // Symmetric key, low id first, so the same pair found from either direction
    // on a later run is the same finding and does not re-notify.
    const pair = h.caseId < h.matchId ? `${h.caseId}:${h.matchId}` : `${h.matchId}:${h.caseId}`;
    const dedupe = `dup:${pair}`;
    out.push({ ...base, districtId: h.districtId, districtName: h.districtName, dedupe });
    if (h.matchDistrictId !== h.districtId) {
      const named = h.reasons.some((r) => r.signal === "people");
      // Same finding, but the far district's copy is stripped of the name.
      const farParams = named ? dupParams(false) : nearParams;
      out.push({
        ...base,
        ...(named ? english("duplicate", farParams) : { detail: base.detail }),
        params: farParams,
        districtId: h.matchDistrictId,
        districtName: h.matchDistrictName,
        dedupe,
      });
    }
  }
  return out;
}

export function toCandidate(i: InsightItem): Candidate {
  return {
    ...i,
    severity: i.severity ?? "info",
    dedupe: i.dedupe ?? `${i.type}:${i.title}`,
  };
}

/**
 * Routes findings to the officers whose scope they fall in. Pure so the routing
 * rules can be tested without a database or a detector run.
 */
export function fanOut(
  candidates: Candidate[],
  users: { id: number; role: string; districtId: number | null }[]
): AlertInsert[] {
  return users.flatMap((u) => {
    const statewide = u.role !== "SHO" || !u.districtId;
    const seen = new Set<string>();
    return candidates
      // An SHO gets their own district's findings plus statewide ones; a
      // finding from another district is outside their scope, the same way the
      // row-level security hides that district's cases.
      .filter((c) => statewide || c.districtId == null || c.districtId === u.districtId)
      // A cross-district finding is emitted once per district so both stations
      // are told. For an officer who can see both, that is one event, not two -
      // and the same pair listed twice in the feed reads as two duplicates.
      .filter((c) => {
        if (!statewide) return true;
        if (seen.has(c.dedupe)) return false;
        seen.add(c.dedupe);
        return true;
      })
      .map((c) => ({
        userId: u.id,
        kind: c.type,
        severity: c.severity,
        title: c.title,
        detail: c.detail,
        ...(c.params ? { params: c.params } : {}),
        query: c.query,
        districtId: c.districtId ?? null,
        caseId: c.caseId ?? null,
        // Same finding routed to two districts must not collide for an HQ user.
        dedupeKey: `${c.dedupe}|${c.districtId ?? "all"}`,
      }));
  });
}

/**
 * Runs every detector and writes the alerts each officer should see.
 * Idempotent: duplicates are skipped on the (userId, dedupeKey) unique index.
 */
export async function generateAlerts(): Promise<{ created: number; users: number; findings: number }> {
  const users = await prisma.khabriUser.findMany({ select: { id: true, role: true, districtId: true } });
  if (!users.length) return { created: 0, users: 0, findings: 0 };

  const [insights, moLinks, duplicates] = await Promise.all([
    computeInsights().catch((e) => { console.error("alerts: insight compute failed:", e); return [] as InsightItem[]; }),
    computeMoLinkAlerts().catch((e) => { console.error("alerts: MO link compute failed:", e); return [] as Candidate[]; }),
    computeDuplicateAlerts().catch((e) => { console.error("alerts: duplicate compute failed:", e); return [] as Candidate[]; }),
  ]);

  const candidates: Candidate[] = [...insights.map(toCandidate), ...moLinks, ...duplicates];
  if (!candidates.length) return { created: 0, users: users.length, findings: 0 };

  const data = fanOut(candidates, users);

  const { count } = await prisma.alert.createMany({ data, skipDuplicates: true });
  return { created: count, users: users.length, findings: candidates.length };
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

export async function listAlerts(userId: number, limit = 25) {
  const [alerts, unread, since] = await Promise.all([
    // Unread first, then by how much it matters — a cross-district MO match
    // should not sit below a forecast just because they were written in the
    // same second by the same job run.
    prisma.alert
      .findMany({
        where: { userId },
        orderBy: [{ readAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
        take: limit,
      })
      .then((rows) =>
        rows.sort(
          (a, b) =>
            Number(Boolean(a.readAt)) - Number(Boolean(b.readAt)) ||
            (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) ||
            b.createdAt.getTime() - a.createdAt.getTime()
        )
      ),
    prisma.alert.count({ where: { userId, readAt: null } }),
    prisma.alert.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
  ]);
  return { alerts, unread, last24h: since };
}

export async function markRead(userId: number, ids?: string[]) {
  const where = ids?.length ? { userId, id: { in: ids }, readAt: null } : { userId, readAt: null };
  const { count } = await prisma.alert.updateMany({ where, data: { readAt: new Date() } });
  return count;
}
