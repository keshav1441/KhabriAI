import { test } from "node:test";
import assert from "node:assert/strict";
import { enforceLimit } from "../lib/sql-validator";

test("appends LIMIT when query has none", () => {
  assert.equal(enforceLimit('SELECT "x" FROM "T"', 500), 'SELECT "x" FROM "T" LIMIT 500');
});

test("keeps an existing LIMIT under the cap", () => {
  assert.equal(enforceLimit('SELECT "x" FROM "T" LIMIT 200', 500), 'SELECT "x" FROM "T" LIMIT 200');
});

test("clamps an oversized LIMIT to the cap", () => {
  assert.equal(enforceLimit('SELECT "x" FROM "T" LIMIT 99999', 500), 'SELECT "x" FROM "T" LIMIT 500');
});

test("a LIMIT inside a subquery does not count as the outer LIMIT", () => {
  assert.equal(
    enforceLimit('SELECT * FROM (SELECT 1 LIMIT 5) t', 500),
    'SELECT * FROM (SELECT 1 LIMIT 5) t LIMIT 500'
  );
});
