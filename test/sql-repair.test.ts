import { test } from "node:test";
import assert from "node:assert/strict";
import { executeWithRepair } from "../lib/sql-repair";

test("returns rows from a query that works first time, without calling repair", async () => {
  let repairCalls = 0;
  const out = await executeWithRepair({
    sql: "SELECT 1",
    run: async () => [{ one: 1 }],
    repair: async () => { repairCalls++; return "SELECT 2"; },
  });
  assert.deepEqual(out, { sql: "SELECT 1", rows: [{ one: 1 }], repaired: false });
  assert.equal(repairCalls, 0);
});

test("feeds the DB error to repair and runs the repaired SQL", async () => {
  const seen: string[] = [];
  const out = await executeWithRepair({
    sql: 'SELECT "bad" FROM "T"',
    run: async (sql) => {
      if (sql.includes("bad")) throw new Error('column "bad" does not exist');
      return [{ good: 1 }];
    },
    repair: async (sql, err) => { seen.push(sql, err); return 'SELECT "good" FROM "T"'; },
  });
  assert.equal(out.repaired, true);
  assert.equal(out.sql, 'SELECT "good" FROM "T"');
  assert.deepEqual(out.rows, [{ good: 1 }]);
  assert.deepEqual(seen, ['SELECT "bad" FROM "T"', 'column "bad" does not exist']);
});

test("repaired SQL still goes through the SELECT-only validator", async () => {
  await assert.rejects(
    executeWithRepair({
      sql: "SELECT x",
      run: async () => { throw new Error("boom"); },
      repair: async () => 'DELETE FROM "T"',
    }),
    /Only SELECT/
  );
});

test("gives up after one repair and surfaces the second error", async () => {
  await assert.rejects(
    executeWithRepair({
      sql: "SELECT x",
      run: async () => { throw new Error("still broken"); },
      repair: async () => "SELECT y",
    }),
    /still broken/
  );
});
