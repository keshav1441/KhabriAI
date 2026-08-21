import { findSimilar, warmupEmbeddings } from "./rag";
import { generateSQL, repairSQL } from "./llm";
import { DB_SCHEMA } from "./prompt-builder";
import { validateSQL, sanitizeSQL, enforceLimit } from "./sql-validator";
import { executeWithRepair } from "./sql-repair";
import { runGuardedQuery } from "./db";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export const MAX_ROWS = 500;
export const QUERY_TIMEOUT_MS = 8000;

// Remove CaseMasterID from SELECT when query uses GROUP BY — prevents 42803 error
export function fixGroupByConflict(sql: string): string {
  if (!/\bGROUP\s+BY\b/i.test(sql)) return sql;
  return sql
    .replace(/cm\."CaseMasterID"(\s+AS\s+\w+)?\s*,\s*/gi, "")
    .replace(/,\s*cm\."CaseMasterID"(\s+AS\s+\w+)?/gi, "");
}

function prepare(raw: string): string {
  const sql = fixGroupByConflict(sanitizeSQL(raw));
  const v = validateSQL(sql);
  if (!v.valid) throw Object.assign(new Error(v.error ?? "Invalid SQL"), { sql });
  return enforceLimit(sql, MAX_ROWS);
}

// The one text-to-SQL pipeline: retrieve few-shot → generate → validate →
// execute under guards → (on DB error) repair once. The agent tool and the
// eval runner both call this so the eval measures what the product ships.
export async function answerWithSQL(
  question: string,
  opts: { history?: ChatTurn[]; req?: Request; repair?: boolean; excludeIndex?: number; fewShotK?: number } = {}
): Promise<{ sql: string; rows: Record<string, unknown>[]; repaired: boolean; retrievalScores: number[] }> {
  const { history = [], req, repair = true, excludeIndex, fewShotK = 2 } = opts;
  await warmupEmbeddings(req);
  const examples = await findSimilar(question, fewShotK, excludeIndex, req);
  const fewShot = examples.map((e) => `-- Q: ${e.question}\n${e.sql}`).join("\n\n");
  const sql = prepare(await generateSQL(DB_SCHEMA, fewShot, question, history));

  const run = (s: string) => runGuardedQuery(s, { timeoutMs: QUERY_TIMEOUT_MS });
  const out = repair
    ? await executeWithRepair({
        sql,
        run,
        repair: async (bad, err) => prepare(await repairSQL(DB_SCHEMA, question, bad, err)),
      })
    : { sql, rows: await run(sql), repaired: false };

  const rows = out.rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) o[k] = typeof v === "bigint" ? Number(v) : v;
    return o;
  });
  return { ...out, rows, retrievalScores: examples.map((e) => e.score) };
}
