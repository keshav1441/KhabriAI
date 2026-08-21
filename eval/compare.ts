// Execution-match in the Spider/BIRD sense: two result sets are equal when
// they hold the same multiset of rows, comparing values only — column names,
// column order and row order are ignored.
function norm(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  // Numbers compare at 2-decimal precision: AVG() vs ROUND(AVG(), 1) is presentation, not a wrong answer.
  if (typeof v === "bigint") return String(v);
  if (typeof v === "number") return String(Math.round(v * 100) / 100);
  if (typeof v === "string") return v !== "" && !isNaN(Number(v)) ? String(Math.round(Number(v) * 100) / 100) : v;
  return JSON.stringify(v);
}

function rowKey(row: Record<string, unknown>): string {
  return Object.values(row).map(norm).sort().join("\u0001");
}

const ID = "CaseMasterID";
const hasId = (rows: Record<string, unknown>[]) => rows.length > 0 && rows.every((r) => ID in r);

export function resultsMatch(a: Record<string, unknown>[], b: Record<string, unknown>[]): boolean {
  if (a.length !== b.length) return false;
  // Row lists: the prompt mandates CaseMasterID as the first column, so the
  // identity of the cases returned is the ground truth; which descriptive
  // columns accompany them is presentation.
  if (hasId(a) && hasId(b)) {
    a = a.map((r) => ({ [ID]: r[ID] }));
    b = b.map((r) => ({ [ID]: r[ID] }));
  }
  const ka = a.map(rowKey).sort();
  const kb = b.map(rowKey).sort();
  return ka.every((k, i) => k === kb[i]);
}
