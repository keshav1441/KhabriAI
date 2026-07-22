import type Groq from "groq-sdk";
import { generateSQL } from "../llm";
import { DB_SCHEMA } from "../prompt-builder";
import { validateSQL, sanitizeSQL } from "../sql-validator";
import { classifyQuery, type VizType } from "../query-classifier";
import { findSimilar, warmupEmbeddings } from "../rag";
import { findSimilarCases, type RelatedCase } from "../case-retrieval";
import { getCachedInsights, setCachedInsights, type InsightItem } from "../insights-cache";
import { computeInsights } from "../insights-compute";
import { prisma } from "../db";
import { getCatalystApp, withCatalystTimeout } from "../catalyst-client";
import { predictChargesheetRisk, type RiskContribution } from "../risk-model";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export interface QueryDatabaseResult {
  status: "ok" | "error";
  sql?: string;
  rows?: Record<string, unknown>[];
  vizType?: VizType;
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

export interface PredictRiskResult {
  status: "ok" | "error";
  label?: string;
  probability?: number;
  contributions?: RiskContribution[];
  source?: "local" | "quickml";
  message?: string;
}

// Crime groups the seed data marks as "Heinous" (matches prisma/seed.ts CRIME_HEADS).
const HEINOUS_CRIME_GROUPS = new Set(["Crimes Against Body", "Crimes Against Women"]);

// Remove CaseMasterID from SELECT when query uses GROUP BY — prevents 42803 error
function fixGroupByConflict(sql: string): string {
  if (!/\bGROUP\s+BY\b/i.test(sql)) return sql;
  return sql
    .replace(/cm\."CaseMasterID"(\s+AS\s+\w+)?\s*,\s*/gi, "")
    .replace(/,\s*cm\."CaseMasterID"(\s+AS\s+\w+)?/gi, "");
}

export const TOOL_SCHEMAS: Groq.Chat.ChatCompletionTool[] = [
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
];

export async function runQueryDatabase(
  args: { question: string },
  history: ChatTurn[],
  req?: Request
): Promise<QueryDatabaseResult> {
  const question = args.question?.trim();
  if (!question) return { status: "error", message: "Missing question" };

  try {
    await warmupEmbeddings(req);
    const examples = await findSimilar(question, 2, undefined, req);
    const fewShot = examples.map((e) => `-- Q: ${e.question}\n${e.sql}`).join("\n\n");
    const rawSQL = await generateSQL(DB_SCHEMA, fewShot, question, history);
    let sql = sanitizeSQL(rawSQL);
    sql = fixGroupByConflict(sql);

    const validation = validateSQL(sql);
    if (!validation.valid) {
      return { status: "error", sql, message: validation.error ?? "Invalid SQL" };
    }

    const vizType = classifyQuery(sql);
    const result = await prisma.$queryRawUnsafe(sql);
    const rows = (result as Record<string, unknown>[]).map((r) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) out[k] = typeof v === "bigint" ? Number(v) : v;
      return out;
    });
    return { status: "ok", sql, rows, vizType };
  } catch (e) {
    console.error("queryDatabase tool failed:", e);
    return { status: "error", message: "Query execution failed" };
  }
}

export async function runSearchRelatedCases(args: { query: string }): Promise<SearchRelatedCasesResult> {
  const query = args.query?.trim();
  if (!query) return { status: "error", message: "Missing query" };

  try {
    const cases = await findSimilarCases(query, 5);
    return { status: "ok", cases };
  } catch (e) {
    console.error("searchRelatedCases tool failed:", e);
    return { status: "error", message: "Related-case search failed" };
  }
}

export async function runCheckInsights(req?: Request): Promise<CheckInsightsResult> {
  try {
    const cached = await getCachedInsights(req);
    if (cached) return { status: "ok", insights: cached };

    const insights = await computeInsights();
    await setCachedInsights(insights, req);
    return { status: "ok", insights };
  } catch (e) {
    console.error("checkInsights tool failed:", e);
    return { status: "error", message: "Insights lookup failed" };
  }
}

export async function runGetNetworkOrMapData(
  args: { kind: "network" | "map" },
  req?: Request
): Promise<NetworkOrMapResult> {
  const kind = args.kind === "map" ? "map" : "network";

  try {
    const origin = req ? new URL(req.url).origin : "";
    const path = kind === "map" ? "/api/map-data" : "/api/network-data";
    const res = await fetch(`${origin}${path}`, { cache: "no-store" });
    if (!res.ok) return { status: "error", message: `${path} returned ${res.status}` };

    const data = await res.json();
    if (kind === "map") {
      const rows = ((data.districts ?? []) as { name: string; count: number }[]).map((d) => ({
        district_name: d.name,
        case_count: d.count,
      }));
      return { status: "ok", rows, vizType: "chart" };
    }

    return { status: "ok", rows: data.rows ?? [], vizType: "graph" };
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

  // Fallback: interpretable local model (also the Explainable-AI layer). Used
  // whenever the Catalyst QuickML classifier isn't available — i.e. any local
  // demo. In production (AppSail + CATALYST_AUTOML_MODEL_ID) the trained model
  // below takes over.
  if (!app || !AUTOML_MODEL_ID) {
    const pred = predictChargesheetRisk({
      hasArrest: args.hasArrest,
      daysSinceRegistered: args.daysSinceRegistered,
      heinous: HEINOUS_CRIME_GROUPS.has(args.crimeType),
      victimCount: args.victimCount,
      accusedCount: args.accusedCount,
    });
    return { status: "ok", label: pred.label, probability: pred.probability, contributions: pred.contributions, source: "local" };
  }

  try {
    const [crimeHead, district] = await Promise.all([
      prisma.crimeHead.findFirst({ where: { CrimeGroupName: { equals: args.crimeType, mode: "insensitive" } } }),
      prisma.district.findFirst({ where: { DistrictName: { equals: args.district, mode: "insensitive" } } }),
    ]);
    if (!crimeHead) return { status: "error", message: `Unknown crime type: ${args.crimeType}` };
    if (!district) return { status: "error", message: `Unknown district: ${args.district}` };

    const result = await withCatalystTimeout(
      app.zia().automl(AUTOML_MODEL_ID, {
        crime_major_head_id: String(crimeHead.CrimeHeadID),
        district_id: String(district.DistrictID),
        victim_count: String(args.victimCount),
        accused_count: String(args.accusedCount),
        days_since_registered: String(args.daysSinceRegistered),
        gravity_heinous: HEINOUS_CRIME_GROUPS.has(crimeHead.CrimeGroupName ?? "") ? "1" : "0",
        has_arrest: args.hasArrest ? "1" : "0",
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
