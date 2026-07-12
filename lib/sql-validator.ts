import { Parser } from "node-sql-parser";

const parser = new Parser();

// AST-based validation instead of a regex blocklist: a regex can be evaded
// by SQL it doesn't anticipate (alternate keyword casing, comments splitting
// a keyword, dialect-specific mutating syntax). Parsing into a real AST and
// checking the statement's structural type is exhaustive by construction —
// anything that isn't a single top-level SELECT node fails closed.
export function validateSQL(sql: string): { valid: boolean; error?: string } {
  const cleaned = sql.trim();
  if (!cleaned) return { valid: false, error: "Empty SQL" };

  let parsed: ReturnType<Parser["astify"]>;
  try {
    parsed = parser.astify(cleaned, { database: "PostgreSQL" });
  } catch {
    return { valid: false, error: "Could not parse SQL" };
  }

  const statements = Array.isArray(parsed) ? parsed : [parsed];
  if (statements.length !== 1) {
    return { valid: false, error: "Multiple statements not allowed" };
  }

  const stmt = statements[0];
  if (!stmt || stmt.type !== "select") {
    return { valid: false, error: `Only SELECT queries allowed (got "${stmt?.type ?? "unknown"}")` };
  }

  return { valid: true };
}

export function sanitizeSQL(sql: string): string {
  // strip complete thinking blocks, then fall back to extracting from first SELECT
  // (handles truncated blocks when max_tokens cuts off before </think>)
  let s = sql.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  const fence = s.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  const selectIdx = s.search(/\bSELECT\b/i);
  if (selectIdx > 0) s = s.slice(selectIdx);

  // model sometimes appends trailing prose after the query ("Note: I have assumed...")
  // with no clean separator — cut it off at the first statement boundary or blank line
  const semiIdx = s.indexOf(";");
  if (semiIdx !== -1) s = s.slice(0, semiIdx);
  s = s.split(/\n\s*\n/)[0];

  return s.replace(/;+\s*$/, "").trim();
}
