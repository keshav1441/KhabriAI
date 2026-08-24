import type OpenAI from "openai";
import { classifyQuery, type VizType } from "../query-classifier";
import { answerWithSQL, type ChatTurn } from "../text-to-sql";
import { findSimilarCases, similarCasesTo, similarCasesToText, type RelatedCase } from "../case-retrieval";
import { prisma as db } from "../db";
import { getScope } from "../chat-auth";
import { getCachedInsights, setCachedInsights, scopeInsights, type InsightItem } from "../insights-cache";
import { computeInsights } from "../insights-compute";
import { computeHotspots, type PatrolPriority } from "../hotspot-forecast";
import { prisma } from "../db";
import { getCatalystApp, withCatalystTimeout } from "../catalyst-client";
import { predictChargesheetRisk, type RiskContribution } from "../risk-model";
import { buildCrew, type CrewDossier } from "../crew";
import { scopedClient } from "../db";
import { similarNames } from "../entity-resolve";

export type { ChatTurn };

export interface QueryDatabaseResult {
  status: "ok" | "error";
  sql?: string;
  rows?: Record<string, unknown>[];
  vizType?: VizType;
  repaired?: boolean;
  /** The database error the repair fixed - kept so the trace can show both. */
  repairError?: string;
  /** Few-shot questions the SQL was written from, with their retrieval scores. */
  fewShot?: { question: string; score: number }[];
  substitutions?: { column: string; from: string; to: string }[];
  suggestions?: string[];
  ambiguousPerson?: { token: string; count: number; examples: string[] } | null;
  message?: string;
}

export interface FindSimilarCasesResult {
  status: "ok" | "error";
  sourceCaseId?: number;
  rows?: Record<string, unknown>[];
  cases?: RelatedCase[];
  message?: string;
}

export interface SearchRelatedCasesResult {
  status: "ok" | "error";
  cases?: RelatedCase[];
  message?: string;
}

export interface CheckInsightsResult {
  status: "ok" | "error";
  insights?: InsightItem[];
  message?: string;
}

export interface NetworkOrMapResult {
  status: "ok" | "error";
  rows?: Record<string, unknown>[];
  vizType?: VizType;
  message?: string;
}

export interface PredictHotspotsResult {
  status: "ok" | "error";
  horizonDays?: number;
  method?: string;
  priorities?: PatrolPriority[];
  rows?: Record<string, unknown>[];
  vizType?: VizType;
  message?: string;
}

export interface PredictRiskResult {
  status: "ok" | "error";
  label?: string;
  probability?: number;
  contributions?: RiskContribution[];
  source?: "local" | "quickml";
  message?: string;
}

export interface BuildCrewDossierResult {
  status: "ok" | "error";
  /** Narratives stripped — see runBuildCrewDossier. */
  dossier?: CrewDossier;
  rows?: Record<string, unknown>[];
  vizType?: VizType;
  /** One name, several people: the agent must ask instead of picking one. */
  ambiguousPerson?: { token: string; count: number; examples: string[] } | null;
  suggestions?: string[];
  message?: string;
}

// Crime groups the seed data marks as "Heinous" (matches prisma/seed.ts CRIME_HEADS).
const HEINOUS_CRIME_GROUPS = new Set(["Crimes Against Body", "Crimes Against Women"]);

/**
 * Every tool argument arrives inside the planner's JSON, which is written by a
 * model: a parameter described as an "18-digit CrimeNo" comes back as a number
 * as readily as a string, and `args.crimeNo.trim()` on a number throws before
 * the executor's own try/catch can see it - killing the whole run mid-answer.
 * Nothing here trusts the declared type; everything is coerced first.
 */
function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  // An object or array is not a value the officer typed - "[object Object]"
  // would be searched for as if it were a name.
  if (typeof value === "object") return "";
  return String(value).trim();
}

function num(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export const TOOL_SCHEMAS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "queryDatabase",
      description:
        "Run a natural-language sub-question against the FIR case database via generated SQL. Use for any factual/statistical/count/list question about cases, crimes, accused, victims, districts, arrests, or chargesheets.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The specific sub-question to answer with SQL, in natural language.",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchRelatedCases",
      description:
        "Full-text search past FIR case narratives for similar or related cases (MO matching, precedents). Use when the question asks about similar cases or patterns in case facts.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Free-text description of the case facts or pattern to search for.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "checkInsights",
      description:
        "Get precomputed anomaly insights: district-level crime spikes, repeat-accused patterns, statewide weekly crime surges. Use for questions about trends, anomalies, or what's notable right now.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "predictHotspots",
      description:
        "Forecast where cases are likely to land next and which stations should be told. Returns ranked patrol priorities: district x crime group with a least-squares trend over the last six complete months, the projected count for the coming period, how well the line fits, and the stations carrying that district's recent load. Use for forward-looking or deployment questions - where to patrol, what is expected to rise, where to place resources. Do NOT use for what has already happened; that is queryDatabase.",
      parameters: {
        type: "object",
        properties: {
          district: { type: "string", description: "Limit the answer to one district, if the officer named one." },
          crimeGroup: { type: "string", description: "Limit to one crime group, e.g. Crimes Against Property." },
          horizonDays: { type: "number", description: "Projection window in days, 7-90. Defaults to 30." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getNetworkOrMapData",
      description:
        "Get accused-network graph data (accused linked across multiple cases) or district-level case-count distribution. Use for questions about criminal networks/links between accused, or geographic distribution of cases.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["network", "map"],
            description: "'network' for accused-linkage graph, 'map' for per-district case counts.",
          },
        },
        required: ["kind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "predictRisk",
      description:
        "Predict the likelihood a case will be charge-sheeted (vs stay under investigation, closed, or a false case), using a trained Catalyst QuickML classifier. Use when asked about a case's outcome likelihood or chargesheet risk.",
      parameters: {
        type: "object",
        properties: {
          crimeType: {
            type: "string",
            description:
              "Crime group, one of: Crimes Against Body, Crimes Against Property, Crimes Against Women, Cybercrimes, Economic Offences, Road Accidents, Narcotics, Other IPC Crimes.",
          },
          district: { type: "string", description: "Karnataka district name, e.g. 'Mysuru'." },
          victimCount: { type: "number", description: "Number of victims in the case." },
          accusedCount: { type: "number", description: "Number of accused in the case." },
          daysSinceRegistered: { type: "number", description: "Days elapsed since the case was registered." },
          hasArrest: { type: "boolean", description: "Whether an arrest has been made in this case." },
        },
        required: ["crimeType", "district", "victimCount", "accusedCount", "daysSinceRegistered", "hasArrest"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "findSimilarCases",
      description:
        "Modus-operandi linking: find FIRs whose narrative describes the same METHOD as a given case (by CaseMasterID or 18-digit CrimeNo) or as a free-text description of a method. Use for 'similar cases', 'same gang/crew', 'linked cases', 'same modus operandi', 'has this happened elsewhere', or cross-district pattern questions. Returns the closest cases with a similarity score, district, crime type, date and status.",
      parameters: {
        type: "object",
        properties: {
          caseMasterId: { type: "number", description: "CaseMasterID of the source case, if known." },
          crimeNo: { type: "string", description: "18-digit CrimeNo of the source case, if the officer quoted one." },
          description: { type: "string", description: "Free-text description of the method, when there is no source case." },
          excludeSourceDistrict: { type: "boolean", description: "True to return only cases from OTHER districts (cross-jurisdiction links)." },
          topK: { type: "number", description: "How many cases to return (default 5, max 10)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buildCrewDossier",
      description:
        "Build a crew/gang dossier around one case or one person: walks outward along co-accused links (people charged in the same FIR) and modus-operandi links (narratives describing the same method), and returns the members, the cases with how each was reached, the districts crossed, the recurring signature phrases and what stage each case is at. Use when the officer asks WHO is behind a series, to map a crew or gang around a case or person, or to place a case inside a wider network. Do NOT use for a plain 'what else looks like this' single-case lookup - that is findSimilarCases.",
      parameters: {
        type: "object",
        properties: {
          crimeNo: { type: "string", description: "18-digit CrimeNo of the seed case, if the officer quoted one." },
          caseId: { type: "number", description: "CaseMasterID of the seed case, if known." },
          personName: { type: "string", description: "Full name of the accused to start from, when there is no case." },
          personId: { type: "string", description: "PersonID of the accused to start from, if known." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "askClarification",
      description:
        "Ask the officer ONE short clarifying question instead of querying, ONLY when the request cannot be answered without guessing something that changes the answer materially: a person referred to only by a first name or nickname, a place that is not a Karnataka district or station, a time reference with no defined meaning (e.g. 'recently', 'a while ago'), or a comparison with no stated baseline. Do NOT ask when a sensible default exists (no district -> statewide; no period -> all time; 'Bengaluru' -> Bengaluru Urban).",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "The clarifying question, one sentence, in the officer's language." },
          options: { type: "array", items: { type: "string" }, description: "2-4 concrete choices the officer can pick from, if applicable." },
        },
        required: ["question"],
      },
    },
  },
];

export async function runQueryDatabase(
  args: { question: string },
  history: ChatTurn[],
  req?: Request
): Promise<QueryDatabaseResult> {
  try {
    const question = str(args.question);
    if (!question) return { status: "error", message: "Missing question" };

    const { sql, rows, repaired, repairError, fewShot, substitutions, suggestions, ambiguousPerson } = await answerWithSQL(question, { history, req });
    return { status: "ok", sql, rows, vizType: classifyQuery(sql), repaired, repairError, fewShot, substitutions, suggestions, ambiguousPerson };
  } catch (e) {
    console.error("queryDatabase tool failed:", e);
    const err = e as Error & { sql?: string };
    return { status: "error", sql: err.sql, message: (err.message ?? "Query execution failed").slice(0, 200) };
  }
}

export async function runFindSimilarCases(args: {
  caseMasterId?: number;
  crimeNo?: string;
  description?: string;
  excludeSourceDistrict?: boolean;
  topK?: number;
}, req?: Request): Promise<FindSimilarCasesResult> {
  try {
    const topK = Math.min(Math.max(num(args.topK) || 5, 1), 10);
    const crimeNo = str(args.crimeNo);
    const description = str(args.description);
    const { districtId } = await getScope(req);
    // Resolve the seed through the officer's own scope. On the unscoped client
    // a CrimeNo from another district resolves and then fails later with a
    // different message than one that does not exist at all - which is enough
    // to enumerate valid case numbers statewide from the chat box.
    const scoped = scopedClient(districtId);
    let sourceId = num(args.caseMasterId) || undefined;
    let sourceDistrict: string | null = null;
    if (!sourceId && crimeNo) {
      const r = await scoped.$queryRawUnsafe<{ id: number }[]>(`SELECT "CaseMasterID" AS id FROM "CaseMaster" WHERE "CrimeNo" = $1 LIMIT 1`, crimeNo);
      sourceId = r[0]?.id;
      if (!sourceId) return { status: "error", message: `No case with CrimeNo ${crimeNo} in this officer's scope` };
    }
    if (sourceId && args.excludeSourceDistrict) {
      const r = await scoped.$queryRawUnsafe<{ district: string }[]>(
        `SELECT d."DistrictName" AS district FROM "CaseMaster" cm JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID" JOIN "District" d ON d."DistrictID" = u."DistrictID" WHERE cm."CaseMasterID" = $1`, sourceId);
      sourceDistrict = r[0]?.district ?? null;
    }
    const cases = sourceId
      ? await similarCasesTo(sourceId, { topK, excludeDistrict: sourceDistrict, districtId })
      : description
        ? await similarCasesToText(description, { topK, districtId })
        : [];
    if (!sourceId && !description) return { status: "error", message: "Give a case (CaseMasterID or CrimeNo) or a description of the method." };
    if (!cases.length) return { status: "error", message: "No embedded narratives to compare against (run scripts/backfill-embeddings.ts)." };
    // Table-shaped rows for the chat viz; the full cases go to the Related Cases panel.
    const rows = cases.map((c) => ({
      CaseMasterID: c.id, CrimeNo: c.crimeNo, similarity: Math.round(c.score * 100) / 100,
      district: c.district, station: c.station, crime: c.crimeType, registered: c.registered, status: c.status,
    }));
    return { status: "ok", sourceCaseId: sourceId, rows, cases };
  } catch (e) {
    console.error("findSimilarCases tool failed:", e);
    return { status: "error", message: "Similar-case search failed" };
  }
}

export async function runSearchRelatedCases(args: { query: string }, req?: Request): Promise<SearchRelatedCasesResult> {
  try {
    const query = str(args.query);
    if (!query) return { status: "error", message: "Missing query" };

    const cases = await findSimilarCases(query, 5, (await getScope(req)).districtId);
    return { status: "ok", cases };
  } catch (e) {
    console.error("searchRelatedCases tool failed:", e);
    return { status: "error", message: "Related-case search failed" };
  }
}

export async function runCheckInsights(req?: Request): Promise<CheckInsightsResult> {
  try {
    const cached = await getCachedInsights(req);
    let insights = cached;
    if (!insights) {
      insights = await computeInsights();
      await setCachedInsights(insights, req);
    }

    // The chat box is not a way around the posting: the same cut /api/insights
    // applies on the way out applies here, or a district officer reads another
    // district's findings - named accused included - just by asking.
    const { districtId } = await getScope(req);
    return { status: "ok", insights: scopeInsights(insights, districtId) };
  } catch (e) {
    console.error("checkInsights tool failed:", e);
    return { status: "error", message: "Insights lookup failed" };
  }
}

/**
 * Deployment questions, answered with the same transparent trend the reports
 * view uses. The planner gets the ranked cells and the sentence explaining each
 * one - never a projected number on its own, since a forecast an officer cannot
 * argue with is not usable in a briefing.
 */
export async function runPredictHotspots(
  args: { district?: string; crimeGroup?: string; horizonDays?: number },
  req?: Request
): Promise<PredictHotspotsResult> {
  try {
    const horizon = Math.min(Math.max(num(args.horizonDays) || 30, 7), 90);
    const forecast = await computeHotspots(horizon);

    // The posting is a bound, not a default. Cutting on the district id first -
    // exactly as /api/forecast/hotspots does - means `args.district` can only
    // ever narrow what the officer may already see; a Kalaburagi SHO naming
    // Mysuru gets nothing, not Mysuru's deployment priorities.
    const { districtId, districtName } = await getScope(req);
    let priorities = forecast.priorities;
    if (districtId) {
      priorities = priorities.filter((p) => p.districtId === districtId).map((p, i) => ({ ...p, rank: i + 1 }));
    }

    const wanted = str(args.district).toLowerCase();
    const group = str(args.crimeGroup).toLowerCase();
    if (wanted) priorities = priorities.filter((p) => p.district.toLowerCase().includes(wanted));
    if (group) priorities = priorities.filter((p) => p.crimeGroup.toLowerCase().includes(group));

    if (!priorities.length) {
      // Name the district the answer was actually confined to, which for a
      // district-posted officer is their own whichever district was asked for.
      const scopeLabel = districtName ?? (wanted ? str(args.district) : null);
      return {
        status: "ok",
        horizonDays: horizon,
        method: forecast.method,
        priorities: [],
        rows: [],
        vizType: "table",
        message: scopeLabel
          ? `No crime group is trending up in ${scopeLabel} with enough history to project.`
          : "No cell has both a rising trend and enough history to project.",
      };
    }

    return {
      status: "ok",
      horizonDays: horizon,
      method: forecast.method,
      priorities,
      rows: priorities.map((p) => ({
        rank: p.rank,
        district: p.district,
        crime_group: p.crimeGroup,
        last_30_days: p.observed30,
        projected: p.predicted30,
        trend_per_month: p.slopePerMonth,
        confidence: p.confidence,
        stations: p.stations.map((st) => `${st.station} (${st.share}%)`).join(", "),
      })),
      vizType: "table",
    };
  } catch (e) {
    console.error("predictHotspots tool failed:", e);
    return { status: "error", message: "Hotspot forecast failed" };
  }
}

// Per-district case counts, the same aggregate /api/map-data's Observed layer
// reads. Run through the scoped client, so a district officer sees one row.
const MAP_COUNTS_SQL = `
  SELECT d."DistrictName" AS district_name, COUNT(*)::int AS case_count
  FROM "CaseMaster" cm
  JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
  JOIN "District" d ON d."DistrictID" = u."DistrictID"
  GROUP BY d."DistrictName"
  ORDER BY case_count DESC`;

// The co-offender network, flattened to one row per person: who they are, how
// many cases they carry, how many distinct co-accused link to them inside the
// network, and the crime group they mostly work in. Edges are pairs charged
// together in two or more FIRs - a recurring crew, not a one-off pairing.
const NETWORK_SQL = `
  WITH strong AS (
    SELECT a1."PersonID" AS p1, a2."PersonID" AS p2
    FROM "Accused" a1
    JOIN "Accused" a2
      ON a2."CaseMasterID" = a1."CaseMasterID"
     AND a1."PersonID" < a2."PersonID"
    WHERE a1."PersonID" IS NOT NULL AND a2."PersonID" IS NOT NULL
    GROUP BY a1."PersonID", a2."PersonID"
    HAVING COUNT(DISTINCT a1."CaseMasterID") >= 2
  ),
  linked AS (
    SELECT p1 AS pid, p2 AS other FROM strong
    UNION ALL
    SELECT p2 AS pid, p1 AS other FROM strong
  )
  SELECT a."PersonID" AS "PersonID",
         MAX(a."AccusedName") AS "AccusedName",
         COUNT(DISTINCT a."CaseMasterID")::int AS case_count,
         (SELECT COUNT(DISTINCT l.other)::int FROM linked l WHERE l.pid = a."PersonID") AS co_accused,
         (SELECT ch."CrimeGroupName"
            FROM "Accused" aa
            JOIN "CaseMaster" cm ON cm."CaseMasterID" = aa."CaseMasterID"
            JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
           WHERE aa."PersonID" = a."PersonID"
           GROUP BY ch."CrimeGroupName"
           ORDER BY COUNT(*) DESC
           LIMIT 1) AS crime_types
  FROM "Accused" a
  WHERE a."PersonID" IN (SELECT pid FROM linked)
  GROUP BY a."PersonID"
  ORDER BY co_accused DESC, case_count DESC
  LIMIT 60`;

/**
 * Network and map evidence, read from the database directly.
 *
 * It used to re-enter its own HTTP layer with `fetch(origin + path)`, which
 * forwarded no session cookie: requireUser 401'd every call, and with no `req`
 * at all the relative URL threw. It also read `data.rows`, a key
 * /api/network-data never returns. Querying here instead keeps the officer's
 * scope (the same RLS transaction the routes use) and returns the rows/vizType
 * contract every other tool speaks.
 */
export async function runGetNetworkOrMapData(
  args: { kind: "network" | "map" },
  req?: Request
): Promise<NetworkOrMapResult> {
  const kind = str(args.kind) === "map" ? "map" : "network";

  try {
    const { districtId } = await getScope(req);
    const scoped = scopedClient(districtId);

    if (kind === "map") {
      const rows = await scoped.$queryRawUnsafe<{ district_name: string; case_count: number }[]>(MAP_COUNTS_SQL);
      if (!rows.length) return { status: "error", message: "No cases to distribute across districts in this officer's scope." };
      return { status: "ok", rows, vizType: "chart" };
    }

    const rows = await scoped.$queryRawUnsafe<Record<string, unknown>[]>(NETWORK_SQL);
    if (!rows.length) return { status: "error", message: "No accused are linked by two or more shared cases in this officer's scope." };
    return { status: "ok", rows, vizType: "graph" };
  } catch (e) {
    console.error("getNetworkOrMapData tool failed:", e);
    return { status: "error", message: "Network/map data lookup failed" };
  }
}

const AUTOML_MODEL_ID = process.env.CATALYST_AUTOML_MODEL_ID;

export async function runPredictRisk(
  args: {
    crimeType: string;
    district: string;
    victimCount: number;
    accusedCount: number;
    daysSinceRegistered: number;
    hasArrest: boolean;
  },
  req?: Request
): Promise<PredictRiskResult> {
  const app = AUTOML_MODEL_ID ? getCatalystApp(req) : null;
  const crimeType = str(args.crimeType);
  const districtName = str(args.district);
  const victimCount = num(args.victimCount) ?? 0;
  const accusedCount = num(args.accusedCount) ?? 0;
  const daysSinceRegistered = num(args.daysSinceRegistered) ?? 0;
  // The planner writes "true"/"false" as often as a JSON boolean.
  const hasArrest = args.hasArrest === true || str(args.hasArrest).toLowerCase() === "true";

  // Fallback: interpretable local model (also the Explainable-AI layer). Used
  // whenever the Catalyst QuickML classifier isn't available — i.e. any local
  // demo. In production (AppSail + CATALYST_AUTOML_MODEL_ID) the trained model
  // below takes over.
  if (!app || !AUTOML_MODEL_ID) {
    const pred = predictChargesheetRisk({
      hasArrest,
      daysSinceRegistered,
      heinous: HEINOUS_CRIME_GROUPS.has(crimeType),
      victimCount,
      accusedCount,
    });
    return { status: "ok", label: pred.label, probability: pred.probability, contributions: pred.contributions, source: "local" };
  }

  try {
    const [crimeHead, district] = await Promise.all([
      prisma.crimeHead.findFirst({ where: { CrimeGroupName: { equals: crimeType, mode: "insensitive" } } }),
      prisma.district.findFirst({ where: { DistrictName: { equals: districtName, mode: "insensitive" } } }),
    ]);
    if (!crimeHead) return { status: "error", message: `Unknown crime type: ${crimeType}` };
    if (!district) return { status: "error", message: `Unknown district: ${districtName}` };

    const result = await withCatalystTimeout(
      app.zia().automl(AUTOML_MODEL_ID, {
        crime_major_head_id: String(crimeHead.CrimeHeadID),
        district_id: String(district.DistrictID),
        victim_count: String(victimCount),
        accused_count: String(accusedCount),
        days_since_registered: String(daysSinceRegistered),
        gravity_heinous: HEINOUS_CRIME_GROUPS.has(crimeHead.CrimeGroupName ?? "") ? "1" : "0",
        has_arrest: hasArrest ? "1" : "0",
      })
    );

    const cls = result.classification_result;
    if (!cls || Object.keys(cls).length === 0) {
      return { status: "error", message: "Model returned no classification result" };
    }
    const [label, probability] = Object.entries(cls).reduce((best, cur) => (cur[1] > best[1] ? cur : best));
    return { status: "ok", label, probability, source: "quickml" };
  } catch (e) {
    console.error("predictRisk tool failed:", e);
    return { status: "error", message: "Risk prediction failed" };
  }
}

type PersonHit = { person_id: string; name: string | null; cases: number };

/**
 * A name is not an identity. Resolve it to exactly one PersonID or refuse:
 * picking the busiest "Ravi" would put the wrong man at the centre of a gang
 * dossier. Matches the ambiguity contract queryDatabase already returns, so the
 * agent asks the same follow-up question it asks for a bare first name.
 */
async function resolvePerson(
  db: ReturnType<typeof scopedClient>,
  rawName: string
): Promise<{ personId: string } | BuildCrewDossierResult> {
  const name = rawName.trim();
  const hits = await db.$queryRawUnsafe<PersonHit[]>(
    `SELECT a."PersonID" AS person_id, MAX(a."AccusedName") AS name, COUNT(DISTINCT a."CaseMasterID")::int AS cases
     FROM "Accused" a
     WHERE a."PersonID" IS NOT NULL AND a."AccusedName" ILIKE $1
     GROUP BY a."PersonID"
     ORDER BY cases DESC
     LIMIT 10`,
    `%${name}%`
  );

  if (!hits.length) {
    // Never rewrite a person name silently - offer the near misses instead.
    const all = await db.$queryRawUnsafe<{ n: string }[]>(`SELECT DISTINCT "AccusedName" AS n FROM "Accused" WHERE "AccusedName" IS NOT NULL`);
    const suggestions = similarNames(name, all.map((r) => r.n).filter(Boolean), 5);
    return { status: "error", message: `No accused named ${name} is in scope.`, suggestions };
  }

  // An exact name wins over the substring matches it dragged in.
  const exact = hits.filter((h) => (h.name ?? "").toLowerCase() === name.toLowerCase());
  const candidates = exact.length ? exact : hits;
  if (candidates.length > 1) {
    const examples = candidates.slice(0, 5).map((h) => `${h.name ?? h.person_id} (${h.cases} cases)`);
    return {
      status: "error",
      message: `${candidates.length} different people match "${name}". Ask the officer for the full name, PersonID or district before building a dossier.`,
      ambiguousPerson: { token: name, count: candidates.length, examples },
    };
  }
  return { personId: candidates[0].person_id };
}

export async function runBuildCrewDossier(
  args: { crimeNo?: string; caseId?: number; personName?: string; personId?: string },
  req?: Request
): Promise<BuildCrewDossierResult> {
  try {
    const crimeNo = str(args.crimeNo);
    const personName = str(args.personName);
    let personId = str(args.personId) || undefined;
    let caseId = num(args.caseId) || undefined;
    if (!caseId && !crimeNo && !personId && !personName) {
      return { status: "error", message: "Give a case (CaseMasterID or CrimeNo) or a person (name or PersonID) to build the dossier around." };
    }

    const { districtId } = await getScope(req);
    const scoped = scopedClient(districtId);

    if (!caseId && crimeNo) {
      const r = await scoped.$queryRawUnsafe<{ id: number }[]>(`SELECT "CaseMasterID" AS id FROM "CaseMaster" WHERE "CrimeNo" = $1 LIMIT 1`, crimeNo);
      caseId = r[0]?.id;
      if (!caseId) return { status: "error", message: `No case with CrimeNo ${crimeNo}` };
    }
    if (!caseId && !personId && personName) {
      const resolved = await resolvePerson(scoped, personName);
      if ("status" in resolved) return resolved;
      personId = resolved.personId;
    }

    const dossier = await buildCrew({ caseId, personId }, { districtId });
    if (!dossier.cases.length) {
      return { status: "error", message: "Nothing to build a dossier from - the seed case or person is not in this officer's scope." };
    }

    // The brief facts are the bulk of the payload and the planner never needs
    // them: the recurring phrases are already distilled into `signature`.
    const lean: CrewDossier = { ...dossier, cases: dossier.cases.map((c) => ({ ...c, briefFacts: null })) };
    // One row per member for the table viz; the dossier carries the rest.
    const rows = dossier.members.map((m) => ({
      name: m.name,
      PersonID: m.personId,
      cases_in_crew: m.casesInCrew,
      total_cases: m.totalCases,
      districts: m.districts.join(", "),
      arrests: m.arrests,
    }));
    return { status: "ok", dossier: lean, rows, vizType: "table" };
  } catch (e) {
    console.error("buildCrewDossier tool failed:", e);
    return { status: "error", message: "Crew dossier build failed" };
  }
}
