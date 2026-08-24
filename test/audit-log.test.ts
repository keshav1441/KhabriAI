import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { clip, rowsIn } from "../lib/agent/audit-log";

// An audit row has to prove what a tool was asked and what it returned without
// becoming a second copy of the case database — and it has to say when it cut
// something, or a reviewer would read a truncated result as the whole result.

test("short values are stored whole", () => {
  assert.equal(clip("two men on a black Pulsar", 2000), "two men on a black Pulsar");
});

test("objects are stored as JSON", () => {
  assert.equal(clip({ district: "Mysuru", limit: 5 }, 2000), '{"district":"Mysuru","limit":5}');
});

test("an oversized value is cut and says so", () => {
  const long = "x".repeat(5000);
  const out = clip(long, 100)!;
  assert.ok(out.startsWith("x".repeat(100)));
  assert.match(out, /truncated 4900 chars/);
});

test("nothing to record stays null rather than becoming \"null\"", () => {
  assert.equal(clip(null, 100), null);
  assert.equal(clip(undefined, 100), null);
  assert.equal(clip("", 100), null);
});

test("row count comes from the result's rows, when it has any", () => {
  assert.equal(rowsIn({ status: "ok", rows: [{ a: 1 }, { a: 2 }] }), 2);
  assert.equal(rowsIn({ status: "ok", rows: [] }), 0);
  assert.equal(rowsIn({ status: "ok" }), null);
  assert.equal(rowsIn(null), null);
});
