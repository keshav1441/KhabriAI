import { randomUUID } from "node:crypto";
import type Groq from "groq-sdk";
import { getGroqClient } from "../groq-client";
import type { VizType } from "../query-classifier";
import type { RelatedCase } from "../case-retrieval";
import {
  TOOL_SCHEMAS,
  runQueryDatabase,
  runSearchRelatedCases,
  runCheckInsights,
  runGetNetworkOrMapData,
  runPredictRisk,
  type ChatTurn,
  type QueryDatabaseResult,
  type SearchRelatedCasesResult,
} from "./tools";
import { logAuditStep, logAuditRun } from "./audit-log";

const ORCH_MODEL = process.env.GROQ_ORCH_MODEL ?? "llama-3.3-70b-versatile";
const MAX_ITERATIONS = 4;

const SYSTEM_PROMPT = `You are KhabriAI, an investigation copilot for the Karnataka State Police FIR (First Information Report) database.
Use the available tools to gather data before answering. Break multi-part questions into separate tool calls — call several tools in the same turn if needed.
Once you have enough information, stop calling tools and answer with a concise analyst narrative.`;

const FINAL_SYNTHESIS_PROMPT =
  'Based on the tool results above, give a concise final analyst narrative answering the user\'s question. 2-4 sentences, cite concrete numbers where available. Do not call any more tools. ' +
  'If a tool result has status "error", do not invent, estimate, or guess the missing value — state plainly that this specific piece of information is unavailable, using the tool\'s error message.';

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
    case "searchRelatedCases": {
      const value = await runSearchRelatedCases(args as { query: string });
      return { status: value.status, value };
    }
    case "checkInsights": {
      const value = await runCheckInsights(req);
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
  req?: Request
): AsyncGenerator<AgentEvent> {
  const groq = getGroqClient();
  const runId = randomUUID();
  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-6).map((h) => ({ role: h.role, content: h.content }) as Groq.Chat.ChatCompletionMessageParam),
    { role: "user", content: question },
  ];

  let lastQueryResult: QueryDatabaseResult | null = null;
  let lastCasesResult: SearchRelatedCasesResult | null = null;
  let toolCallCount = 0;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let assistantMsg: Groq.Chat.ChatCompletionMessage | undefined;
    // Groq's tool-calling occasionally emits malformed function-call syntax
    // (400 tool_use_failed) instead of structured tool_calls for a given
    // sample — retry once before degrading to whatever's been gathered so far.
    for (let attempt = 0; attempt < 2 && !assistantMsg; attempt++) {
      try {
        const completion = await groq.chat.completions.create({
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

    const toolCalls = assistantMsg?.tool_calls ?? [];
    if (!assistantMsg || toolCalls.length === 0) break;

    messages.push(assistantMsg);

    const parsed = toolCalls.map((tc) => ({ tc, args: safeParseArgs(tc.function.arguments) }));

    for (const { tc, args } of parsed) {
      yield { type: "step", id: tc.id, tool: tc.function.name, args, result: null, status: "pending" };
    }

    const executed = await Promise.all(
      parsed.map(async ({ tc, args }) => {
        const { status, value } = await executeTool(tc.function.name, args, history, req);
        return { tc, args, status, value };
      })
    );

    for (const { tc, args, status, value } of executed) {
      toolCallCount++;
      yield { type: "step", id: tc.id, tool: tc.function.name, args, result: value, status };
      void logAuditStep({ runId, question, tool: tc.function.name, args, result: value, status }, req);
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(value) });
      if (tc.function.name === "queryDatabase") lastQueryResult = value as QueryDatabaseResult;
      if (tc.function.name === "searchRelatedCases") lastCasesResult = value as SearchRelatedCasesResult;
    }
  }

  yield {
    type: "meta",
    sql: lastQueryResult?.sql ?? "",
    rows: lastQueryResult?.rows ?? [],
    vizType: lastQueryResult?.vizType ?? "table",
    sqlError: lastQueryResult?.status === "error" ? (lastQueryResult.message ?? "Query failed") : null,
    relatedCases: lastCasesResult?.cases ?? [],
  };

  messages.push({ role: "system", content: FINAL_SYNTHESIS_PROMPT });

  let finalAnswer = "";
  try {
    const stream = await groq.chat.completions.create({
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

  void logAuditRun({ runId, question, toolCallCount, finalAnswer }, req);

  yield { type: "done" };
}
