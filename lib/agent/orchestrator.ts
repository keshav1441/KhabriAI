import { randomUUID } from "node:crypto";
import type OpenAI from "openai";
import { getLlmClient } from "../mistral-client";
import type { VizType } from "../query-classifier";
import type { RelatedCase } from "../case-retrieval";
import {
  TOOL_SCHEMAS,
  runQueryDatabase,
  runSearchRelatedCases,
  runFindSimilarCases,
  runCheckInsights,
  runPredictHotspots,
  runGetNetworkOrMapData,
  runPredictRisk,
  runBuildCrewDossier,
  type ChatTurn,
  type QueryDatabaseResult,
  type SearchRelatedCasesResult,
  type FindSimilarCasesResult,
  type BuildCrewDossierResult,
} from "./tools";
import { logAuditStep, logAuditRun } from "./audit-log";
import { getScope } from "../chat-auth";

const ORCH_MODEL = process.env.MISTRAL_ORCH_MODEL ?? "mistral-large-latest";
const MAX_ITERATIONS = 4;

const SYSTEM_PROMPT = `You are KhabriAI, an investigation copilot for the Karnataka State Police FIR (First Information Report) database.
Use the available tools to gather data before answering. Break multi-part questions into separate tool calls — call several tools in the same turn if needed.
Once you have enough information, stop calling tools and answer with a concise analyst narrative.
If the request is genuinely ambiguous in a way that changes the answer, call askClarification instead of guessing - but prefer sensible defaults over questions.
Questions about a named person (accused, victim, complainant) go to queryDatabase first; searchRelatedCases is for narrative/modus-operandi similarity, not name lookup.
A person identified only by a bare first name or nickname (e.g. "Ravi", "Priya") matches many records: call askClarification asking for the full name, PersonID, or district instead of listing everyone.`;

const FINAL_SYNTHESIS_PROMPT =
  'Based on the tool results above, give a concise final analyst narrative answering the user\'s question. 2-4 sentences, cite concrete numbers where available. Do not call any more tools. ' +
  'If a tool result has status "error", do not invent, estimate, or guess the missing value — state plainly that this specific piece of information is unavailable, using the tool\'s error message. ' +
  'Start with the answer itself — no heading, no "Analyst Narrative:" preamble. Use **bold** only on key figures and names; no bullet points, no headings. ' +
  'If a queryDatabase result has "substitutions", mention the correction briefly (e.g. "interpreting Belgavi as Belagavi"). ' +
  'If it returned no rows and has "suggestions", say no record matched that exact name and list the suggested names so the officer can choose. ' +
  'For findSimilarCases results, describe the shared method in one sentence and name the linked cases by CrimeNo and district; call out links that cross district boundaries. ' +
  'If it has "ambiguousPerson", do not summarise any cases: say that N different people named X appear in the database, list the example names, and ask for the full name, PersonID or district.';

export type StepEvent = {
  type: "step";
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  status: "ok" | "error" | "pending";
};
export type MetaEvent = {
  type: "meta";
  sql: string;
  rows: Record<string, unknown>[];
  vizType: VizType;
  sqlError: string | null;
  relatedCases: RelatedCase[];
};
export type TokenEvent = { type: "token"; token: string };
export type DoneEvent = { type: "done" };
export type AgentEvent = StepEvent | MetaEvent | TokenEvent | DoneEvent;

// A query can return thousands of rows (e.g. "list all accused"); feeding them
// all to the synthesis LLM overflows its context and it fails to summarise.
// Cap the rows shown to the model (the full set still flows to the viz).
function capForLLM(value: unknown): unknown {
  if (value && typeof value === "object" && "rows" in value) {
    const v = value as { rows?: unknown[] };
    if (Array.isArray(v.rows) && v.rows.length > 40) {
      return { ...v, rows: v.rows.slice(0, 40), rowsTruncated: v.rows.length };
    }
  }
  return value;
}

function safeParseArgs(raw: string | undefined): Record<string, unknown> {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  history: ChatTurn[],
  req?: Request
): Promise<{ status: "ok" | "error"; value: unknown }> {
  switch (name) {
    case "queryDatabase": {
      const value = await runQueryDatabase(args as { question: string }, history, req);
      return { status: value.status, value };
    }
    case "findSimilarCases": {
      const value = await runFindSimilarCases(args as Parameters<typeof runFindSimilarCases>[0], req);
      return { status: value.status, value };
    }
    case "buildCrewDossier": {
      const value = await runBuildCrewDossier(args as Parameters<typeof runBuildCrewDossier>[0], req);
      return { status: value.status, value };
    }
    case "searchRelatedCases": {
      const value = await runSearchRelatedCases(args as { query: string }, req);
      return { status: value.status, value };
    }
    case "checkInsights": {
      const value = await runCheckInsights(req);
      return { status: value.status, value };
    }
    case "predictHotspots": {
      const value = await runPredictHotspots(args as Parameters<typeof runPredictHotspots>[0], req);
      return { status: value.status, value };
    }
    case "getNetworkOrMapData": {
      const value = await runGetNetworkOrMapData(args as { kind: "network" | "map" }, req);
      return { status: value.status, value };
    }
    case "predictRisk": {
      const value = await runPredictRisk(
        args as {
          crimeType: string;
          district: string;
          victimCount: number;
          accusedCount: number;
          daysSinceRegistered: number;
          hasArrest: boolean;
        },
        req
      );
      return { status: value.status, value };
    }
    default:
      return { status: "error", value: { status: "error", message: `Unknown tool: ${name}` } };
  }
}

export async function* runAgent(
  question: string,
  history: ChatTurn[],
  req?: Request,
  lang: "en" | "kn" = "en"
): AsyncGenerator<AgentEvent> {
  const llm = getLlmClient();
  const runId = randomUUID();
  const runStartedAt = Date.now();
  const scope = await getScope(req);
  // The audit trail records who asked and how far their posting let them see,
  // so a reviewer can tell an HQ answer from a district one after the fact.
  const actor = {
    userId: scope.userId,
    email: scope.email,
    role: scope.role,
    districtId: scope.districtId,
    districtName: scope.districtName,
  };
  const scopeNote = scope.districtName
    ? ` This officer is posted to ${scope.districtName} district and can only see that district's data - every count, list and link is within ${scope.districtName}. Say "in ${scope.districtName}", never "statewide".`
    : "";
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT + scopeNote },
    ...history.slice(-6).map((h) => ({ role: h.role, content: h.content }) as OpenAI.Chat.ChatCompletionMessageParam),
    { role: "user", content: question },
  ];

  let lastQueryResult: QueryDatabaseResult | null = null;
  let lastCasesResult: SearchRelatedCasesResult | null = null;
  let lastSimilarResult: FindSimilarCasesResult | null = null;
  let lastCrewResult: BuildCrewDossierResult | null = null;
  let toolCallCount = 0;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let assistantMsg: OpenAI.Chat.ChatCompletionMessage | undefined;
    // Tool-calling occasionally emits malformed function-call syntax instead of
    // structured tool_calls for a given sample — retry once before degrading to
    // whatever's been gathered so far.
    for (let attempt = 0; attempt < 2 && !assistantMsg; attempt++) {
      try {
        const completion = await llm.chat.completions.create({
          model: ORCH_MODEL,
          temperature: 0.2,
          max_tokens: 1024,
          messages,
          tools: TOOL_SCHEMAS,
          // Force at least one tool call on the first turn — otherwise the
          // planner sometimes answers straight from parametric memory
          // (fabricated numbers) instead of grounding in the database.
          tool_choice: iter === 0 ? "required" : "auto",
        });
        assistantMsg = completion.choices[0]?.message;
      } catch (e) {
        console.error(`orchestrator planner call failed (attempt ${attempt + 1}):`, e);
      }
    }
    if (!assistantMsg) break;

    // The SDK's tool_calls union also covers custom (non-function) calls, which
    // we never register — keep only function calls so `.function` is defined.
    const toolCalls = (assistantMsg?.tool_calls ?? []).filter(
      (tc): tc is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => tc.type === "function"
    );
    if (!assistantMsg || toolCalls.length === 0) break;

    messages.push(assistantMsg);

    const parsed = toolCalls.map((tc) => ({ tc, args: safeParseArgs(tc.function.arguments) }));

    // A clarification ends the turn: no query, no synthesis - the question IS the answer.
    const clarify = parsed.find((p) => p.tc.function.name === "askClarification");
    if (clarify) {
      const q = String(clarify.args.question ?? "Could you clarify what you mean?");
      const options = Array.isArray(clarify.args.options) ? (clarify.args.options as unknown[]).map(String).filter(Boolean) : [];
      const result = { status: "ok" as const, question: q, options };
      yield { type: "step", id: clarify.tc.id, tool: "askClarification", args: clarify.args, result, status: "ok" };
      void logAuditStep({ runId, question, tool: "askClarification", args: clarify.args, result, status: "ok", actor }, req);
      yield { type: "meta", sql: "", rows: [], vizType: "table", sqlError: null, relatedCases: [] };
      const text = options.length ? [q, "", ...options.map((o) => "\u2022 " + o)].join("\n") : q;
      yield { type: "token", token: text };
      void logAuditRun({ runId, question, toolCallCount: 1, finalAnswer: text, durationMs: Date.now() - runStartedAt, actor }, req);
      yield { type: "done" };
      return;
    }

    for (const { tc, args } of parsed) {
      yield { type: "step", id: tc.id, tool: tc.function.name, args, result: null, status: "pending" };
    }

    const executed = await Promise.all(
      parsed.map(async ({ tc, args }) => {
        const startedAt = Date.now();
        const { status, value } = await executeTool(tc.function.name, args, history, req);
        return { tc, args, status, value, durationMs: Date.now() - startedAt };
      })
    );

    for (const { tc, args, status, value, durationMs } of executed) {
      toolCallCount++;
      yield { type: "step", id: tc.id, tool: tc.function.name, args, result: value, status };
      void logAuditStep({ runId, question, tool: tc.function.name, args, result: value, status, durationMs, actor }, req);
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(capForLLM(value)) });
      if (tc.function.name === "queryDatabase") lastQueryResult = value as QueryDatabaseResult;
      if (tc.function.name === "searchRelatedCases") lastCasesResult = value as SearchRelatedCasesResult;
      if (tc.function.name === "findSimilarCases") lastSimilarResult = value as FindSimilarCasesResult;
      if (tc.function.name === "buildCrewDossier") lastCrewResult = value as BuildCrewDossierResult;
    }
  }

  // A similar-case search is itself the evidence: show its rows as the table
  // and its cases in the Related Cases panel when no SQL query ran.
  // A crew dossier's member list is evidence in the same way; it wins over a
  // similar-case list because it is the broader answer.
  const fallbackRows = !lastQueryResult?.rows?.length
    ? (lastCrewResult?.rows?.length ? lastCrewResult.rows : lastSimilarResult?.rows?.length ? lastSimilarResult.rows : null)
    : null;
  yield {
    type: "meta",
    sql: lastQueryResult?.sql ?? "",
    rows: fallbackRows ?? lastQueryResult?.rows ?? [],
    vizType: fallbackRows ? "table" : (lastQueryResult?.vizType ?? "table"),
    sqlError: lastQueryResult?.status === "error" ? (lastQueryResult.message ?? "Query failed") : null,
    relatedCases: lastCasesResult?.cases ?? lastSimilarResult?.cases ?? [],
  };

  const synthesisPrompt =
    lang === "kn"
      ? FINAL_SYNTHESIS_PROMPT + " Write the entire narrative in Kannada (ಕನ್ನಡ). Keep proper nouns (district names, crime section codes) as-is; numbers may stay in digits."
      : FINAL_SYNTHESIS_PROMPT;
  messages.push({ role: "system", content: synthesisPrompt + scopeNote });

  let finalAnswer = "";
  try {
    const stream = await llm.chat.completions.create({
      model: ORCH_MODEL,
      temperature: 0.3,
      max_tokens: 300,
      stream: true,
      messages,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (token) {
        finalAnswer += token;
        yield { type: "token", token };
      }
    }
    if (!finalAnswer) {
      finalAnswer = "No further information could be synthesized.";
      yield { type: "token", token: finalAnswer };
    }
  } catch (e) {
    console.error("final synthesis failed:", e);
    finalAnswer = "Found results, but could not generate a narrative summary.";
    yield { type: "token", token: finalAnswer };
  }

  void logAuditRun({ runId, question, toolCallCount, finalAnswer, durationMs: Date.now() - runStartedAt, actor }, req);

  yield { type: "done" };
}
