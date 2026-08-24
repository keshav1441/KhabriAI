import { validateSQL, sanitizeSQL } from "./sql-validator";

type Rows = Record<string, unknown>[];

// ponytail: exactly one repair attempt. Text-to-SQL error feedback gets most
// of its gain from the first retry; a second mostly burns tokens.
export async function executeWithRepair(opts: {
  sql: string;
  run: (sql: string) => Promise<Rows>;
  repair: (sql: string, dbError: string) => Promise<string>;
}): Promise<{ sql: string; rows: Rows; repaired: boolean; repairError?: string }> {
  try {
    return { sql: opts.sql, rows: await opts.run(opts.sql), repaired: false };
  } catch (e) {
    const dbError = e instanceof Error ? e.message : String(e);
    const fixed = sanitizeSQL(await opts.repair(opts.sql, dbError));
    const v = validateSQL(fixed);
    if (!v.valid) throw new Error(v.error);
    // The error that forced the repair travels with the fix: an officer reading
    // the trace has to see what went wrong, not just that something did.
    return { sql: fixed, rows: await opts.run(fixed), repaired: true, repairError: dbError };
  }
}
