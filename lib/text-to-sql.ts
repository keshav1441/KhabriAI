import { findSimilar, warmupEmbeddings } from "./rag";
import { generateSQL, repairSQL } from "./llm";
import { DB_SCHEMA } from "./prompt-builder";
import { validateSQL, sanitizeSQL, enforceLimit } from "./sql-validator";
import { executeWithRepair } from "./sql-repair";
import { runGuardedQuery, prisma } from "./db";
import { resolveLiterals, similarNames, ambiguousPerson, type Vocab, type Substitution } from "./entity-resolve";
import { getScope } from "./chat-auth";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export const MAX_ROWS = 500;

// Closed vocabularies for fuzzy literal resolution, refreshed every 10 min.
// ponytail: module-level cache; per-instance is fine for a handful of names.
let vocabCache: { at: number; vocab: Vocab; accused: string[] } | null = null;
async function loadVocab(): Promise<{ vocab: Vocab; accused: string[] }> {
  if (vocabCache && Date.now() - vocabCache.at < 10 * 60_000) return vocabCache;
  const names = async (sql: string) => (await prisma.$queryRawUnsafe(sql) as { n: string }[]).map((r) => r.n).filter(Boolean);
  const [d, u, csh, ch, a] = await Promise.all([
    names('SELECT "DistrictName" AS n FROM "District"'),
    names('SELECT "UnitName" AS n FROM "Unit"'),
    names('SELECT "CrimeHeadName" AS n FROM "CrimeSubHead"'),
    names('SELECT "CrimeGroupName" AS n FROM "CrimeHead"'),
    names('SELECT DISTINCT "AccusedName" AS n FROM "Accused"'),
  ]);
  vocabCache = { at: Date.now(), vocab: { DistrictName: d, UnitName: u, CrimeHeadName: csh, CrimeGroupName: ch }, accused: a };
  return vocabCache;
}

// When a person-name query returns nothing, offer close names instead of
// silently rewriting - the officer decides who they meant.
const ACCUSED_LITERAL = /"AccusedName" *(?:=|ILIKE|LIKE) *'%?([^'%]+)%?'/i;
function accusedSuggestions(sql: string, rows: unknown[], accused: string[]): string[] {
  if (rows.length) return [];
  const m = sql.match(ACCUSED_LITERAL);
  return m ? similarNames(m[1], accused, 5) : [];
}
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
): Promise<{ sql: string; rows: Record<string, unknown>[]; repaired: boolean; substitutions: Substitution[]; suggestions: string[]; ambiguousPerson: { token: string; count: number; examples: string[] } | null; retrievalScores: number[] }> {
  const { history = [], req, repair = true, excludeIndex, fewShotK = 2 } = opts;
  await warmupEmbeddings(req);
  const examples = await findSimilar(question, fewShotK, excludeIndex, req);
  const fewShot = examples.map((e) => `-- Q: ${e.question}\n${e.sql}`).join("\n\n");
  const { vocab, accused } = await loadVocab();
  const scope = await getScope(req);
  // RLS does the enforcing; the note stops the model from adding a contradictory district filter.
  const schema = scope.districtId
    ? `${DB_SCHEMA}\n-- ACCESS SCOPE: this officer only sees ${scope.districtName} district. Rows are already limited to it by the database; do NOT add a district filter unless the question names a different district (which will return nothing).`
    : DB_SCHEMA;
  const resolved = resolveLiterals(prepare(await generateSQL(schema, fewShot, question, history)), vocab);
  const sql = resolved.sql;
  const substitutions: Substitution[] = resolved.substitutions;

  const run = (s: string) => runGuardedQuery(s, { timeoutMs: QUERY_TIMEOUT_MS, districtId: scope.districtId });
  const out = repair
    ? await executeWithRepair({
        sql,
        run,
        repair: async (bad, err) => prepare(await repairSQL(schema, question, bad, err)),
      })
    : { sql, rows: await run(sql), repaired: false };

  const rows = out.rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) o[k] = typeof v === "bigint" ? Number(v) : v;
    return o;
  });
  const ambiguous = ambiguousPerson(out.sql, accused);
  return {
    ...out,
    rows: ambiguous ? [] : rows, // never list 200 strangers for a bare first name
    substitutions,
    suggestions: accusedSuggestions(out.sql, rows, accused),
    ambiguousPerson: ambiguous,
    retrievalScores: examples.map((e) => e.score),
  };
}
