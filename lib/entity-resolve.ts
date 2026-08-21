// Fuzzy resolution of closed-vocabulary literals in generated SQL.
// ponytail: in-memory trigram Dice over ~300 names (districts, stations, crime
// types) — no pg_trgm extension, no extra round trip, unit-testable. Person
// names are deliberately NOT auto-rewritten (a police tool must never silently
// change who a query is about); similarNames() only offers suggestions.

export type Vocab = Partial<Record<"DistrictName" | "UnitName" | "CrimeHeadName" | "CrimeGroupName", string[]>>;
export type Substitution = { column: string; from: string; to: string };

// Old / anglicised district names officers still use.
const ALIASES: Record<string, string> = {
  bangalore: "Bengaluru Urban", bengaluru: "Bengaluru Urban", "bengaluru city": "Bengaluru Urban", blr: "Bengaluru Urban",
  mysore: "Mysuru", belgaum: "Belagavi", gulbarga: "Kalaburagi", bellary: "Ballari", bijapur: "Vijayapura",
  tumkur: "Tumakuru", shimoga: "Shivamogga", chikmagalur: "Chikkamagaluru", chikballapur: "Chikkaballapura",
  chamrajnagar: "Chamarajanagara", mangalore: "Dakshina Kannada", mangaluru: "Dakshina Kannada",
  hubli: "Dharwad", hubballi: "Dharwad", hospet: "Vijayanagara", karwar: "Uttara Kannada", madikeri: "Kodagu",
};

const THRESHOLD = 0.45;

function trigrams(s: string): Set<string> {
  const t = `  ${s.toLowerCase().trim()} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}

export function similarity(a: string, b: string): number {
  const ta = trigrams(a), tb = trigrams(b);
  let common = 0;
  for (const g of ta) if (tb.has(g)) common++;
  return (2 * common) / (ta.size + tb.size);
}

function best(value: string, candidates: string[]): string | null {
  const lower = value.toLowerCase().trim();
  const exact = candidates.find((c) => c.toLowerCase() === lower);
  if (exact) return exact;
  if (ALIASES[lower] && candidates.includes(ALIASES[lower])) return ALIASES[lower];
  let top: string | null = null, topScore = THRESHOLD;
  for (const c of candidates) {
    const s = similarity(value, c);
    if (s > topScore) { top = c; topScore = s; }
  }
  return top;
}

// Rewrites `"Column" = 'literal'` for the vocab columns when the literal is
// not an exact known value but is close to one. Returns what was changed so
// the Case Board can show "Belgavi → Belagavi".
export function resolveLiterals(sql: string, vocab: Vocab): { sql: string; substitutions: Substitution[] } {
  const substitutions: Substitution[] = [];
  const columns = Object.keys(vocab).join("|");
  if (!columns) return { sql, substitutions };
  const re = new RegExp(`"(${columns})" *= *'((?:[^']|'')+)'`, "g");
  const out = sql.replace(re, (m, column: string, lit: string) => {
    const candidates = vocab[column as keyof Vocab] ?? [];
    const to = best(lit, candidates);
    if (!to || to === lit) return m;
    substitutions.push({ column, from: lit, to });
    return `"${column}" = '${to.replace(/'/g, "''")}'`;
  });
  return { sql: out, substitutions };
}

// Top-k names similar to `name`, best first; empty when nothing is close.
export function similarNames(name: string, names: string[], k = 5): string[] {
  return names
    .map((n) => ({ n, s: similarity(name, n) }))
    .filter((x) => x.s > THRESHOLD)
    .sort((a, b) => b.s - a.s || a.n.localeCompare(b.n))
    .slice(0, k)
    .map((x) => x.n);
}

const PERSON_LITERAL = /"(?:AccusedName|VictimName|ComplainantName)" *(?:=|ILIKE|LIKE) *'%?([^'%]+)%?'/i;

// A bare single-token person filter ("Ravi") that matches more than `max`
// distinct people is not a query, it is a guess. Report how many and who.
export function ambiguousPerson(sql: string, people: string[], max = 3): { token: string; count: number; examples: string[] } | null {
  const m = sql.match(PERSON_LITERAL);
  if (!m) return null;
  const token = m[1].trim();
  if (/\s/.test(token)) return null;
  const needle = token.toLowerCase();
  const matches = people.filter((p) => p.toLowerCase().split(/\s+/).includes(needle)).sort();
  if (matches.length <= max) return null;
  return { token, count: matches.length, examples: matches.slice(0, 5) };
}
