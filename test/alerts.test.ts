import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fanOut, toCandidate, type Candidate } from "../lib/alerts";

// Routing only — no detector run, no database. Findings are hand-built so the
// scope rules are the only thing under test.
const finding = (districtId: number | null, dedupe: string): Candidate => ({
  type: "spike",
  title: `Finding ${dedupe}`,
  detail: "detail",
  query: "query",
  districtId,
  severity: "warning",
  dedupe,
});

const D5 = finding(5, "d5");
const D9 = finding(9, "d9");
const STATEWIDE = finding(null, "state");
const ALL = [D5, D9, STATEWIDE];

const titles = (rows: { title: string }[]) => rows.map((r) => r.title).sort();

test("an SHO sees their own district and statewide findings, not another district's", () => {
  const rows = fanOut(ALL, [{ id: 1, role: "SHO", districtId: 5 }]);
  assert.deepEqual(titles(rows), [D5.title, STATEWIDE.title].sort());
  assert.ok(rows.every((r) => r.userId === 1));
});

test("an HQ user sees every finding", () => {
  const rows = fanOut(ALL, [{ id: 2, role: "HQ", districtId: null }]);
  assert.deepEqual(titles(rows), titles([D5, D9, STATEWIDE]));
});

test("an SHO with no district posting is treated as statewide", () => {
  const rows = fanOut(ALL, [{ id: 3, role: "SHO", districtId: null }]);
  assert.deepEqual(titles(rows), titles([D5, D9, STATEWIDE]));
});

test("one finding routed to two districts keeps two distinct dedupe keys", () => {
  // The cross-district MO case: the same link is pushed to both stations, so an
  // HQ user must end up with both rows instead of one losing to the unique index.
  const link = { ...finding(5, "mo:1:2"), type: "mo_link", severity: "critical" as const, caseId: 1 };
  const mirror = { ...link, districtId: 9 };
  const rows = fanOut([link, mirror], [{ id: 4, role: "HQ", districtId: null }]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.dedupeKey), ["mo:1:2|5", "mo:1:2|9"]);
  assert.equal(new Set(rows.map((r) => r.dedupeKey)).size, 2);
  // A statewide finding lands under a single "all" key.
  assert.equal(fanOut([STATEWIDE], [{ id: 4, role: "HQ", districtId: null }])[0].dedupeKey, "state|all");
});

test("finding fields map onto the alert row, with severity defaulting to info", () => {
  const bare = toCandidate({ type: "forecast", title: "T", detail: "D", query: "Q", districtId: 7 });
  assert.equal(bare.severity, "info");
  const [row] = fanOut([bare], [{ id: 5, role: "HQ", districtId: null }]);
  assert.deepEqual(row, {
    userId: 5,
    kind: "forecast",
    severity: "info",
    title: "T",
    detail: "D",
    query: "Q",
    districtId: 7,
    caseId: null,
    dedupeKey: "forecast:T|7",
  });
});
