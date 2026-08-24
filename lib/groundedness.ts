/**
 * Groundedness guard: does every figure in the narrative come from the data?
 *
 * The synthesis model is told to cite concrete numbers from the tool results.
 * When a tool returns nothing useful it will occasionally cite a number anyway,
 * and a fabricated count in a briefing is worse than no count at all - an
 * officer cannot tell the two apart by reading. This module re-derives, from
 * the tool payloads alone, whether each number in the answer could have come
 * from the data, and marks the ones that could not.
 *
 * Pure: no database, no network, no model call. It is a checker, not a second
 * opinion - it never rewrites the narrative, it only labels it.
 */

export interface GroundednessClaim {
  /** The numeric value as written in the narrative (commas stripped). */
  value: number;
  /** The token as it appeared, so the UI can quote the officer's own text. */
  text: string;
  supported: boolean;
  /** Why it was accepted, or why it could not be verified. */
  reason: string;
}

export interface GroundednessVerdict {
  grounded: boolean;
  claims: GroundednessClaim[];
  /** How many numeric claims were actually checked (references excluded). */
  checked: number;
}

// A percentage claim is checked against every ordered pair of returned numbers,
// which is quadratic. Big result sets (thousands of rows) would make that the
// slowest thing in the request, so the pool is capped. The cap only ever makes
// the checker stricter - a claim it cannot derive is reported, never assumed.
const MAX_POOL = 300;
const MAX_PAIR_POOL = 120;

// Values under these keys are prose or opaque identifiers, not figures the
// narrative could be quoting. Pulling numbers out of a SQL string or a case
// narrative would let a hallucinated count "match" the digits of a section
// number that happened to appear in the generated SQL.
const PROSE_KEYS = new Set([
  "sql",
  "message",
  "question",
  "briefFacts",
  "brief_facts",
  "narrative",
  "description",
  "text",
  "signature",
  "explanation",
  "reason",
]);

/** An 18-digit CrimeNo or a long ID is a label, never a computed figure. */
const MAX_FIGURE_DIGITS = 7;

// ---------------------------------------------------------------------------
// Claim extraction
// ---------------------------------------------------------------------------

// Thousands separators only count inside a well-formed group ("1,284"); a
// trailing comma belongs to the sentence, not to the figure, and swallowing it
// would make "In 2024," look like a separated number rather than a year.
const NUMBER_BODY = String.raw`-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?`;
const NUMBER_RE = new RegExp(`(${NUMBER_BODY})(\\s*(?:%|percent\\b))?`, "gi");

/** Words that turn a bare four-digit number into a count rather than a year. */
const UNIT_AFTER =
  /^[\s*_,.:;)-]*(cases?|firs?|f\.i\.r|records?|arrests?|victims?|accused|persons?|people|incidents?|chargesheets?|complaints?|reports?|entries)\b/i;

/** A number that follows one of these is a reference to a record, not a figure. */
const REFERENCE_BEFORE =
  /(crime\s*no\.?|crimeno|fir\s*(?:no\.?)?|f\.i\.r\.?|case\s*(?:master)?\s*id|casemasterid|case\s*no\.?|person\s*id|personid|unit\s*id|district\s*id|section[s]?|sec\.?|u\/s|under\s+section|ipc|bns|crpc|rank|no\.|#)\s*$/i;

/** ...and one of these after it means the same thing (e.g. "302 IPC"). */
const REFERENCE_AFTER = /^\s*(?:ipc|bns|crpc|of\s+the\s+ipc)\b/i;

const MONTH_BEFORE = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*$/i;
const MONTH_AFTER = /^\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;

/**
 * Decide whether a matched number is a claim at all.
 *
 * Years, dates, FIR/CrimeNo strings, section numbers and list ordinals are
 * REFERENCES: the model is repeating a label it was given, not asserting a
 * quantity it computed. Flagging "registered in 2024" as an unverified figure
 * would bury the one case that matters - a count nobody computed - under noise
 * the officer learns to ignore.
 */
/** "the last 30 days", "over 6 months" - the window the question asked about. */
const WINDOW_AFTER = /^\s*(?:-|\s)?(?:day|week|month|year|hour|quarter)s?\b/i;
/** "top 5", "first 3" - the size of the list the officer asked for. */
const REQUEST_BEFORE = /\b(?:top|first|last|latest|nearest|closest|leading|bottom)\s*$/i;

function isReference(raw: string, before: string, after: string, isPercent: boolean, echoed?: (v: string) => boolean): boolean {
  if (isPercent) return false; // a percentage is always an assertion about the data

  // A figure the officer themselves wrote is the question coming back, not an
  // answer: "in the last 30 days" is a window, and flagging it as unverified
  // would put a warning on a perfectly correct reply. A guard that cries wolf
  // is worse than no guard.
  if (echoed?.(raw)) return true;
  if (WINDOW_AFTER.test(after)) return true;
  if (REQUEST_BEFORE.test(before)) return true;

  const digits = raw.replace(/[^0-9]/g, "");

  // Long digit runs are identifiers (CrimeNo is 18 digits, PersonID similar).
  if (digits.length > MAX_FIGURE_DIGITS) return true;

  if (REFERENCE_BEFORE.test(before)) return true;
  if (REFERENCE_AFTER.test(after)) return true;

  // Part of a compound token: 2024-03-11, 11/03/2024, 376(2), 10:30.
  if (/[\d/\-.:(]$/.test(before) && /\d$/.test(before.replace(/[/\-.:(]$/, ""))) return true;
  if (/^\s*[/\-:]\s*\d/.test(after)) return true;
  if (/^\s*(?:st|nd|rd|th)\b/i.test(after)) return true; // "12th March"
  if (MONTH_BEFORE.test(before) || MONTH_AFTER.test(after)) return true;

  // A list ordinal: the number opens a line and is immediately punctuated.
  if (/(^|\n)\s*[*\-•]?\s*$/.test(before) && /^[.)]\s/.test(after)) return true;

  // A bare four-digit year. Kept deliberately narrow: if a unit word follows
  // ("1,984 cases") it is a count that happens to look like a year, and the
  // guard still checks it.
  const isBare = !raw.includes(",") && !raw.includes(".");
  const n = Number(raw);
  if (isBare && digits.length === 4 && n >= 1900 && n <= 2099 && !UNIT_AFTER.test(after)) return true;

  return false;
}

interface RawClaim {
  value: number;
  text: string;
  isPercent: boolean;
  /** Decimals written by the model - the precision any derivation is judged at. */
  precision: number;
}

/** @internal exposed for tests */
export function extractClaims(narrative: string, question?: string): RawClaim[] {
  const text = typeof narrative === "string" ? narrative : "";
  // Numbers the question already contains, matched on digits so "30" and
  // "30 days" and "1,984" all compare the same way.
  const asked = new Set(
    (typeof question === "string" ? question : "").match(/\d[\d,]*(?:\.\d+)?/g)?.map((n) => n.replace(/,/g, "")) ?? []
  );
  const echoed = (v: string) => asked.has(v.replace(/,/g, ""));
  const claims: RawClaim[] = [];
  const seen = new Set<string>();

  NUMBER_RE.lastIndex = 0;
  for (let m = NUMBER_RE.exec(text); m; m = NUMBER_RE.exec(text)) {
    const raw = m[1];
    const isPercent = Boolean(m[2]);
    const start = m.index;
    const end = start + m[0].length;
    // Bold markers are formatting the model adds around figures; they must not
    // hide the keyword that identifies a reference ("Section **302**").
    const before = text.slice(Math.max(0, start - 32), start).replace(/\*+/g, "");
    const after = text.slice(end, end + 20).replace(/\*+/g, "");

    if (isReference(raw, before, after, isPercent, echoed)) continue;

    const value = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;

    const dot = raw.indexOf(".");
    const precision = dot === -1 ? 0 : raw.length - dot - 1;

    // The same figure repeated in one narrative is one claim, not two.
    const key = `${value}|${isPercent}|${precision}`;
    if (seen.has(key)) continue;
    seen.add(key);

    claims.push({ value, text: m[0].trim(), isPercent, precision });
  }
  return claims;
}

// ---------------------------------------------------------------------------
// What the tools actually returned
// ---------------------------------------------------------------------------

interface DataPool {
  /** Numbers that appear literally somewhere in a tool result. */
  values: number[];
  /** Lengths of returned arrays - a row count is a figure the data supports. */
  counts: number[];
  /** Sums of numeric columns / numeric arrays. */
  sums: number[];
}

function pushCapped(target: number[], v: number) {
  if (!Number.isFinite(v)) return;
  if (target.length >= MAX_POOL) return;
  target.push(v);
}

/** Numeric tokens inside a returned string cell ("Whitefield (34%)") are still
 *  returned data - the officer can point at them in the table. */
function numbersInString(s: string, out: number[]) {
  const re = new RegExp(NUMBER_BODY, "g");
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m[0].replace(/[^0-9]/g, "").length > MAX_FIGURE_DIGITS) continue;
    pushCapped(out, Number(m[0].replace(/,/g, "")));
  }
}

function walk(node: unknown, pool: DataPool, depth = 0): void {
  if (node === null || node === undefined || depth > 6) return;

  if (typeof node === "number") {
    pushCapped(pool.values, node);
    return;
  }
  if (typeof node === "boolean") return;
  if (typeof node === "string") {
    numbersInString(node, pool.values);
    return;
  }
  if (typeof node === "bigint") {
    pushCapped(pool.values, Number(node));
    return;
  }

  if (Array.isArray(node)) {
    // The length of any returned list is itself an answer ("5 linked cases").
    pushCapped(pool.counts, node.length);

    // A plain numeric array has a meaningful total.
    const nums = node.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (nums.length > 1 && nums.length === node.length) {
      pushCapped(pool.sums, round(nums.reduce((a, b) => a + b, 0), 6));
    }

    // Column sums across an array of rows: "how many altogether" is the one
    // aggregate an officer expects the assistant to do for them, and it uses
    // only values the tool returned.
    const rows = node.filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v));
    if (rows.length > 1) {
      const totals = new Map<string, number>();
      for (const row of rows) {
        for (const [k, v] of Object.entries(row)) {
          if (PROSE_KEYS.has(k)) continue;
          const n = typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : null;
          if (n === null || !Number.isFinite(n)) continue;
          totals.set(k, (totals.get(k) ?? 0) + n);
        }
      }
      for (const total of totals.values()) pushCapped(pool.sums, round(total, 6));
    }

    for (const item of node) walk(item, pool, depth + 1);
    return;
  }

  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (PROSE_KEYS.has(k) && typeof v === "string") continue;
      walk(v, pool, depth + 1);
    }
  }
}

/** @internal exposed for tests */
export function buildPool(toolResults: unknown[]): DataPool {
  const pool: DataPool = { values: [], counts: [], sums: [] };
  for (const result of toolResults ?? []) walk(result, pool);
  return pool;
}

// ---------------------------------------------------------------------------
// Support decisions
// ---------------------------------------------------------------------------

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** A figure written to one decimal is judged at one decimal: the model rounds
 *  when it writes, so 12.3 must be allowed to stand for 12.34. */
function matchesAt(target: number, precision: number, candidates: number[]): boolean {
  for (const c of candidates) {
    if (round(c, precision) === target) return true;
  }
  return false;
}

/**
 * Derivations accepted, and only these:
 *
 *   1. LITERAL   - the number is a value in a returned row (or inside a
 *                  returned string cell). Nothing was computed.
 *   2. COUNT     - the number equals the length of a returned list. "5 linked
 *                  cases" is a claim about the data's shape, which we can see.
 *   3. SUM       - the number equals the total of a numeric column across the
 *                  returned rows, or of a returned numeric array. Adding up a
 *                  column the officer is looking at introduces no new fact.
 *   4. PERCENT   - only for a token written as a percentage, and only when it
 *                  equals a/b*100 for two numbers the tools returned (a row
 *                  value, a count or a column sum), or v*100 for a returned
 *                  fraction v in [0,1] (probabilities and similarity scores are
 *                  returned that way).
 *
 * Deliberately NOT accepted: differences, averages, medians, growth rates,
 * per-capita figures, or any arithmetic on more than two returned numbers.
 * Each of those has too many candidate operand pairs - with a large result set
 * they would validate almost any number, which is the opposite of a guard.
 */
function judge(claim: RawClaim, pool: DataPool): GroundednessClaim {
  const { value, precision, isPercent, text } = claim;

  if (matchesAt(value, precision, pool.values)) {
    return { value, text, supported: true, reason: "value returned by a tool" };
  }
  if (matchesAt(value, precision, pool.counts)) {
    return { value, text, supported: true, reason: "equals the number of rows returned" };
  }
  if (matchesAt(value, precision, pool.sums)) {
    return { value, text, supported: true, reason: "sum of returned values" };
  }

  if (isPercent) {
    const operands = [...pool.values, ...pool.counts, ...pool.sums].slice(0, MAX_PAIR_POOL);
    // A probability or similarity score comes back as a fraction; the narrative
    // states it as a percentage. That is a unit change, not a new fact.
    for (const v of operands) {
      if (v >= 0 && v <= 1 && round(v * 100, precision) === value) {
        return { value, text, supported: true, reason: "returned fraction stated as a percentage" };
      }
    }
    for (const b of operands) {
      if (!b) continue;
      for (const a of operands) {
        if (round((a / b) * 100, precision) === value) {
          return { value, text, supported: true, reason: "percentage of two returned values" };
        }
      }
    }
  }

  return { value, text, supported: false, reason: "not found in any tool result" };
}

/**
 * Check a narrative against the tool results collected during the run.
 * An empty narrative, empty results, or a run where every number was a
 * reference all come back grounded with `checked: 0` - there was nothing to
 * disprove, and an empty answer is not a lie.
 */
export function checkGroundedness(narrative: string, toolResults: unknown[], question?: string): GroundednessVerdict {
  const claims = extractClaims(narrative ?? "", question);
  if (!claims.length) return { grounded: true, claims: [], checked: 0 };

  const pool = buildPool(toolResults ?? []);
  const judged = claims.map((c) => judge(c, pool));
  return {
    grounded: judged.every((c) => c.supported),
    claims: judged,
    checked: judged.length,
  };
}
