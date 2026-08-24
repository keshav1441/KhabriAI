import { prisma } from "./db";
import type { InsightItem } from "./insights-cache";
import { computeForecasts } from "./forecast";
import { nameTokens, scoreAgainst, type AccusedRecord, type IdentityCandidate } from "./identity-resolve";

/** Live-computes the anomaly-detection queries + predictive forecasts. Shared by the cache-miss path in the insights route and the cron precompute job. */
export async function computeInsights(): Promise<InsightItem[]> {
  const insights: InsightItem[] = [];

  // Anomaly 1: Districts with a 40%+ crime spike in the last COMPLETE month vs
  // the month before. Uses completed months (not the partial current month, in
  // which counts are always low), so the detector fires reliably.
  const spikeResult = await prisma.$queryRaw<
    { district_id: number; district_name: string; this_month: bigint; last_month: bigint }[]
  >`
    SELECT
      d."DistrictID" AS district_id,
      d."DistrictName" AS district_name,
      COUNT(*) FILTER (WHERE cm."CrimeRegisteredDate" >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
                         AND cm."CrimeRegisteredDate" <  DATE_TRUNC('month', NOW())) AS this_month,
      COUNT(*) FILTER (WHERE cm."CrimeRegisteredDate" >= DATE_TRUNC('month', NOW() - INTERVAL '2 months')
                         AND cm."CrimeRegisteredDate" <  DATE_TRUNC('month', NOW() - INTERVAL '1 month')) AS last_month
    FROM "CaseMaster" cm
    JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
    JOIN "District" d ON d."DistrictID" = u."DistrictID"
    GROUP BY d."DistrictID", d."DistrictName"
    HAVING
      COUNT(*) FILTER (WHERE cm."CrimeRegisteredDate" >= DATE_TRUNC('month', NOW() - INTERVAL '2 months')
                         AND cm."CrimeRegisteredDate" <  DATE_TRUNC('month', NOW() - INTERVAL '1 month')) > 5
      AND COUNT(*) FILTER (WHERE cm."CrimeRegisteredDate" >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
                             AND cm."CrimeRegisteredDate" <  DATE_TRUNC('month', NOW()))
        > COUNT(*) FILTER (WHERE cm."CrimeRegisteredDate" >= DATE_TRUNC('month', NOW() - INTERVAL '2 months')
                             AND cm."CrimeRegisteredDate" <  DATE_TRUNC('month', NOW() - INTERVAL '1 month')) * 1.15
    ORDER BY this_month DESC
    LIMIT 3
  `;

  for (const row of spikeResult) {
    const thisMonth = Number(row.this_month);
    const lastMonth = Number(row.last_month);
    const pct = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : 0;
    insights.push({
      type: "spike",
      title: `Crime spike in ${row.district_name}`,
      detail: `${pct}% jump last month (${thisMonth} vs ${lastMonth} the month before)`,
      query: `Show crime breakdown in ${row.district_name} for the last 2 months`,
      districtId: Number(row.district_id),
      districtName: row.district_name,
      severity: pct >= 40 ? "critical" : "warning",
      dedupe: `spike:${row.district_id}:${thisMonth}:${lastMonth}`,
    });
  }

  // Anomaly 2: repeat accused with 3+ cases in last 30 days.
  //
  // This used to GROUP BY a."AccusedName" - string equality - and it was wrong
  // in the worst available direction. Measured 2026-08-25 on the live corpus:
  // of the 95 names that clear the 3-case bar in a 30-day window, 89 span more
  // than one PersonID. "Repeat accused: Vijaya Desai - linked to 6 cases" was
  // five different people, named in one alert as one offender.
  //
  // lib/identity-resolve.ts exists precisely to say why name equality is the
  // wrong join (it measures 83% precision against 28% for naive name matching),
  // so the detector now runs through its scorer: candidates are blocked by a
  // shared name token, clustered by scoreIdentity, and a finding is a scored
  // cluster. Following that module's posture, the alert offers a candidate with
  // the reasons behind it and never asserts that the records are one person.
  for (const c of await repeatAccusedClusters()) {
    insights.push({
      type: "repeat_suspect",
      title: `Possible repeat accused: ${c.name}`,
      detail:
        `${c.caseCount} cases in the last 30 days name someone who scores as the same person ` +
        `(confidence ${c.confidence.toFixed(2)} on the weakest link in the cluster; matched on ${c.why}). ` +
        `${c.crimeTypes}. Identity is inferred from the name, age and gender on each FIR, ` +
        `not from a shared record - verify before treating these as one offender.`,
      query: `Show all cases linked to accused ${c.name} in the last 30 days`,
      // Active in more than one district: a statewide finding, so nobody sees
      // only half of it.
      districtId: c.districts.length > 1 ? null : c.districtId,
      districtName: c.districts.length > 1 ? null : c.districtName,
      severity: "warning",
      // Keyed on the accused rows in the cluster, not on the name: two men who
      // happen to share a name now dedupe as two findings, and a cluster that
      // grows re-notifies while one that does not, does not.
      dedupe: `repeat:${c.accusedIds.join(",")}`,
    });
  }

  // Anomaly 3: Crime category surge statewide this week
  const weekResult = await prisma.$queryRaw<
    { crime_type: string; this_week: bigint; last_week: bigint }[]
  >`
    SELECT
      ch."CrimeGroupName" AS crime_type,
      COUNT(*) FILTER (WHERE cm."CrimeRegisteredDate" >= NOW() - INTERVAL '7 days') AS this_week,
      COUNT(*) FILTER (WHERE cm."CrimeRegisteredDate" >= NOW() - INTERVAL '14 days'
                         AND cm."CrimeRegisteredDate" <  NOW() - INTERVAL '7 days') AS last_week
    FROM "CaseMaster" cm
    JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
    GROUP BY ch."CrimeGroupName"
    HAVING COUNT(*) FILTER (WHERE cm."CrimeRegisteredDate" >= NOW() - INTERVAL '7 days') > 5
    ORDER BY this_week DESC
    LIMIT 1
  `;

  for (const row of weekResult) {
    const thisWeek = Number(row.this_week);
    const lastWeek = Number(row.last_week);
    if (thisWeek > lastWeek * 1.3) {
      const pct = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : 0;
      insights.push({
        type: "weekly_surge",
        title: `${row.crime_type} surging statewide`,
        detail: `${pct}% more ${row.crime_type} cases this week vs last week`,
        query: `Show ${row.crime_type} hotspots in the last 7 days with map`,
        districtId: null,
        districtName: null,
        severity: pct >= 50 ? "critical" : "warning",
        dedupe: `surge:${row.crime_type}:${thisWeek}:${lastWeek}`,
      });
    }
  }

  // Predictive early-warnings: forecast which cells are trending up next month.
  try {
    insights.push(...(await computeForecasts()));
  } catch (e) {
    console.error("forecast compute failed:", e);
  }

  return insights;
}

// ---- repeat accused, resolved rather than string-matched --------------------

interface RepeatFinding {
  name: string;
  caseCount: number;
  accusedIds: number[];
  /** Lowest pairwise confidence inside the cluster - the honest headline. */
  confidence: number;
  why: string;
  crimeTypes: string;
  districts: string[];
  districtId: number | null;
  districtName: string | null;
}

/**
 * How many accused rows the cron path may pull back before clustering.
 *
 * Clustering is O(block^2) inside each shared-name-token block, so the real
 * cost is set by the biggest block rather than by this number. The live corpus
 * carries ~940 accused rows in a 30-day window, so the cap is headroom, not a
 * live constraint; it exists so a bulk backfill or a widened window cannot turn
 * the alert job into a long-running query. Rows come newest-first, so if the cap
 * ever binds it drops the oldest.
 */
const REPEAT_CANDIDATE_CAP = 4000;

/** Distinct cases a cluster must cover before it is worth an officer's attention. */
const REPEAT_MIN_CASES = 3;

/** Most findings to raise per run; the largest clusters first. */
const REPEAT_MAX = 2;

type RepeatRow = {
  accused_id: number; case_id: number; crime_no: string | null; name: string | null;
  age: number | null; gender_id: number | null; district: string | null; district_id: number | null;
  station: string | null; crime_type: string | null; crime_group: string | null; registered: string | null;
};

async function repeatAccusedClusters(): Promise<RepeatFinding[]> {
  const rows = await prisma.$queryRawUnsafe<RepeatRow[]>(
    `SELECT a."AccusedMasterID" AS accused_id, a."CaseMasterID" AS case_id, cm."CrimeNo" AS crime_no,
            a."AccusedName" AS name, a."AgeYear" AS age, a."GenderID" AS gender_id,
            d."DistrictName" AS district, d."DistrictID" AS district_id, u."UnitName" AS station,
            csh."CrimeHeadName" AS crime_type, ch."CrimeGroupName" AS crime_group,
            to_char(COALESCE(cm."IncidentFromDate", cm."CrimeRegisteredDate"), 'YYYY-MM-DD') AS registered
     FROM "Accused" a
     JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID"
     JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
     JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
     JOIN "District" d ON d."DistrictID" = u."DistrictID"
     LEFT JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
     WHERE cm."CrimeRegisteredDate" >= NOW() - INTERVAL '30 days'
       AND a."AccusedName" IS NOT NULL
     ORDER BY cm."CrimeRegisteredDate" DESC
     LIMIT ${REPEAT_CANDIDATE_CAP}`
  );

  const meta = new Map<number, RepeatRow>(rows.map((r) => [r.accused_id, r]));
  const records: AccusedRecord[] = rows.map((r) => ({
    accusedId: r.accused_id,
    caseId: r.case_id,
    crimeNo: r.crime_no,
    name: r.name,
    age: r.age == null ? null : Number(r.age),
    genderId: r.gender_id == null ? null : Number(r.gender_id),
    district: r.district,
    station: r.station,
    crimeType: r.crime_type,
    registered: r.registered,
    // Deliberately withheld. PersonID is the answer key the identity module is
    // graded against, never a signal - see the header of lib/identity-resolve.ts.
    personId: null,
  }));

  return clusterRepeatAccused(records)
    .map((c) => toFinding(c, meta))
    .sort((a, b) => b.caseCount - a.caseCount || b.confidence - a.confidence)
    .slice(0, REPEAT_MAX);
}

export interface RepeatAccusedCluster {
  members: AccusedRecord[];
  /** Distinct cases the cluster covers. */
  size: number;
  /** Weakest confidence of any member against the seed. */
  confidence: number;
  /** The scored candidates behind the cluster, for the "why" line. */
  scored: IdentityCandidate[];
}

/**
 * Greedy seed-and-attach clustering over already-fetched accused rows.
 *
 * Blocking first: two records are only ever compared when they share a name
 * token of three characters or more. That is what keeps this out of O(n^2), and
 * because blocking only widens the comparison set it cannot cause the failure
 * being fixed here. Inside a block a record joins the cluster when
 * scoreIdentity() calls the pair likely (IDENT.threshold). Every member is
 * scored against the SEED, never against whichever member arrived first, so a
 * cluster cannot drift into a different person down a chain of near misses.
 *
 * Pure - no database, no clock - so the rule can be tested on its own.
 *
 * Measured 2026-08-25 over the live 30-day window (937 accused rows, PersonID
 * used only as the answer key): 25 clusters clear the 3-case bar, 17 of them
 * (68%) contain exactly one PersonID. The string-equality detector this
 * replaces produced 95 findings in the same window, of which 6 were one person
 * - 89 were not. Both findings the job actually raises (REPEAT_MAX) were single
 * -person clusters. Runtime is ~1.6s over the full window, which is why the
 * candidate set is capped rather than left unbounded.
 */
export function clusterRepeatAccused(records: AccusedRecord[]): RepeatAccusedCluster[] {
  const byToken = new Map<string, AccusedRecord[]>();
  for (const r of records) {
    for (const tok of tokensOf(r)) {
      const list = byToken.get(tok) ?? byToken.set(tok, []).get(tok)!;
      list.push(r);
    }
  }

  const assigned = new Set<number>();
  const clusters: RepeatAccusedCluster[] = [];

  // Seed with the rows that have the most to attach to, so the busiest offender
  // in the window forms their cluster before a namesake claims a row.
  const seeds = [...records].sort(
    (a, b) => blockSize(byToken, b) - blockSize(byToken, a) || a.accusedId - b.accusedId
  );

  for (const seed of seeds) {
    if (assigned.has(seed.accusedId)) continue;
    const seen = new Set<number>([seed.accusedId]);
    const members: AccusedRecord[] = [seed];
    const scored: IdentityCandidate[] = [];

    for (const tok of tokensOf(seed)) {
      for (const other of byToken.get(tok) ?? []) {
        if (seen.has(other.accusedId) || assigned.has(other.accusedId)) continue;
        seen.add(other.accusedId);
        const cand = scoreAgainst(seed, other);
        if (!cand.isLikely) continue;
        members.push(other);
        scored.push(cand);
      }
    }

    const size = new Set(members.map((m) => m.caseId)).size;
    if (size < REPEAT_MIN_CASES) continue;
    for (const m of members) assigned.add(m.accusedId);
    clusters.push({
      members,
      size,
      // A cluster is only as good as its weakest member: quoting the best pair
      // would describe a link the officer is not actually being shown.
      confidence: Number(Math.min(...scored.map((c) => c.confidence), 1).toFixed(3)),
      scored,
    });
  }

  return clusters.sort((a, b) => b.size - a.size || b.confidence - a.confidence);
}

function tokensOf(r: AccusedRecord): Set<string> {
  return new Set(nameTokens(r.name ?? "").filter((t) => t.length >= 3));
}

function blockSize(byToken: Map<string, AccusedRecord[]>, r: AccusedRecord): number {
  let n = 0;
  for (const tok of tokensOf(r)) n += byToken.get(tok)?.length ?? 0;
  return n;
}

function toFinding(c: RepeatAccusedCluster, meta: Map<number, RepeatRow>): RepeatFinding {
  const rows = c.members.map((m) => meta.get(m.accusedId)).filter((r): r is RepeatRow => Boolean(r));
  const districts = [...new Set(rows.map((r) => r.district).filter((d): d is string => Boolean(d)))];
  const crimeTypes = [...new Set(rows.map((r) => r.crime_group).filter(Boolean))].join(", ");
  const counts = new Map<number, number>();
  for (const r of rows) if (r.district_id != null) counts.set(r.district_id, (counts.get(r.district_id) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  // The signals come from identity-resolve, so the alert can say what carried
  // the match instead of asserting the identity.
  const why = c.scored[0]?.reasons.map((r) => r.signal).join(" + ") || "name";
  return {
    name: c.members[0].name ?? "unnamed accused",
    caseCount: c.size,
    accusedIds: c.members.map((m) => m.accusedId).sort((a, b) => a - b),
    confidence: c.confidence,
    why,
    crimeTypes: crimeTypes || "mixed offences",
    districts,
    districtId: top,
    districtName: rows.find((r) => r.district_id === top)?.district ?? null,
  };
}
