const FORBIDDEN = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXEC|EXECUTE)\b/i;
const COMMENT_STRIP = /--[^\n]*/g;

export function validateSQL(sql: string): { valid: boolean; error?: string } {
  const cleaned = sql.replace(COMMENT_STRIP, "").trim();

  if (!cleaned) return { valid: false, error: "Empty SQL" };

  if (FORBIDDEN.test(cleaned)) {
    return { valid: false, error: "Mutating SQL not allowed" };
  }

  // Block multiple statements
  if (cleaned.replace(/;+\s*$/, "").includes(";")) {
    return { valid: false, error: "Multiple statements not allowed" };
  }

  if (!cleaned.toUpperCase().startsWith("SELECT")) {
    return { valid: false, error: "Only SELECT queries allowed" };
  }

  return { valid: true };
}

export function sanitizeSQL(sql: string): string {
  // strip complete thinking blocks, then fall back to extracting from first SELECT
  // (handles truncated blocks when max_tokens cuts off before </think>)
  let s = sql.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const selectIdx = s.search(/\bSELECT\b/i);
  if (selectIdx > 0) s = s.slice(selectIdx);
  return s.replace(/;+\s*$/, "").trim();
}
