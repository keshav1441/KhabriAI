import { findSimilar, warmupEmbeddings } from "./rag";
import { generateSQL, repairSQL } from "./llm";
import { DB_SCHEMA } from "./prompt-builder";
import { validateSQL, sanitizeSQL, enforceLimit } from "./sql-validator";
import { executeWithRepair } from "./sql-repair";
import { runGuardedQuery, prisma, scopedClient } from "./db";
import { resolveLiterals, similarNames, ambiguousPerson, type Vocab, type Substitution } from "./entity-resolve";
import { getScope } from "./chat-auth";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export const MAX_ROWS = 500;

const VOCAB_TTL_MS = 10 * 60_000;

// District, station and crime-type names are public administrative vocabulary,
// so one cache serves everyone.
let vocabCache: { at: number; vocab: Vocab } | null = null;

// Accused names are NOT. They feed the "did you mean" suggestions and the
// ambiguity guard, both of which put real names in front of the officer, so the
// list has to be the one their posting lets them see - and the cache has to be
// keyed by that posting, or the first officer to ask would hand their
// vocabulary to the next one.
const accusedCache = new Map<string, { at: number; names: string[] }>();

async function loadVocab(districtId: number | null): Promise<{ vocab: Vocab; accused: string[] }> {
  const names = async (db: Pick<typeof prisma, "$queryRawUnsafe">, sql: string) =>
    ((await db.$queryRawUnsafe(sql)) as { n: string }[]).map((r) => r.n).filter(Boolean);

  if (!vocabCache || Date.now() - vocabCache.at >= VOCAB_TTL_MS) {
    const [d, u, csh, ch] = await Promise.all([
      names(prisma, 'SELECT "DistrictName" AS n FROM "District"'),
      names(prisma, 'SELECT "UnitName" AS n FROM "Unit"'),
      names(prisma, 'SELECT "CrimeHeadName" AS n FROM "CrimeSubHead"'),
      names(prisma, 'SELECT "CrimeGroupName" AS n FROM "CrimeHead"'),
    ]);
    vocabCache = { at: Date.now(), vocab: { DistrictName: d, UnitName: u, CrimeHeadName: csh, CrimeGroupName: ch } };
  }

  const key = districtId == null ? "all" : String(districtId);
  const cachedAccused = accusedCache.get(key);
  if (cachedAccused && Date.now() - cachedAccused.at < VOCAB_TTL_MS) {
    return { vocab: vocabCache.vocab, accused: cachedAccused.names };
  }

  const accused = await names(scopedClient(districtId), 'SELECT DISTINCT "AccusedName" AS n FROM "Accused"');
  accusedCache.set(key, { at: Date.now(), names: accused });
  return { vocab: vocabCache.vocab, accused };
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
): Promise<{
  sql: string;
  rows: Record<string, unknown>[];
  repaired: boolean;
  /** The database error that forced the repair, when one did. */
  repairError?: string;
  substitutions: Substitution[];
  suggestions: string[];
  ambiguousPerson: { token: string; count: number; examples: string[] } | null;
  retrievalScores: number[];
  /** The few-shot questions this SQL was written from - the trace shows them so
   *  an officer can see which precedents the query was modelled on. */
  fewShot: { question: string; score: number }[];
}> {
  const { history = [], req, repair = true, excludeIndex, fewShotK = 2 } = opts;
  await warmupEmbeddings(req);
  const examples = await findSimilar(question, fewShotK, excludeIndex, req);
  const fewShot = examples.map((e) => `-- Q: ${e.question}\n${e.sql}`).join("\n\n");
  // Resolved before the vocabulary, which is scoped to this officer's posting.
  const scope = await getScope(req);
  const { vocab, accused } = await loadVocab(scope.districtId);
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
    fewShot: examples.map((e) => ({ question: e.question, score: e.score })),
  };
}
