import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { clusterRepeatAccused } from "../lib/insights-compute";
import type { AccusedRecord } from "../lib/identity-resolve";

// The repeat-accused detector used to GROUP BY AccusedName. On the live corpus
// 89 of the 95 names that cleared its bar covered more than one PersonID, so the
// alert named several people as one offender. These tests pin the replacement:
// a cluster is scored by lib/identity-resolve, never asserted from a string.

let nextId = 1;
const rec = (over: Partial<AccusedRecord> = {}): AccusedRecord => ({
  accusedId: nextId++,
  caseId: nextId * 100,
  crimeNo: null,
  name: "Ravi Kumar",
  age: 34,
  genderId: 1,
  district: "Bengaluru City",
  station: "Ashok Nagar",
  crimeType: "Theft",
  registered: "2026-01-10",
  personId: null,
  ...over,
});

test("three files naming the same man cluster into one finding", () => {
  const clusters = clusterRepeatAccused([
    rec({ registered: "2026-01-10" }),
    rec({ registered: "2026-02-04" }),
    rec({ registered: "2026-02-20" }),
  ]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].size, 3);
  assert.ok(clusters[0].confidence >= 0.6, `confidence ${clusters[0].confidence}`);
});

test("the same written name at incompatible ages is not one person", () => {
  // Three FIRs weeks apart. A 34-year-old and a 61-year-old in the same month
  // cannot be the same man, and the age signal is what says so.
  const clusters = clusterRepeatAccused([
    rec({ age: 34 }),
    rec({ age: 61 }),
    rec({ age: 22 }),
  ]);
  assert.equal(clusters.length, 0, JSON.stringify(clusters.map((c) => c.size)));
});

test("a gender disagreement blocks the merge even on an exact name match", () => {
  const clusters = clusterRepeatAccused([rec({ genderId: 1 }), rec({ genderId: 2 }), rec({ genderId: 2 })]);
  // The two women may cluster with each other; the man must not join them.
  assert.ok(clusters.every((c) => new Set(c.members.map((m) => m.genderId)).size === 1));
  assert.ok(clusters.every((c) => c.size < 3));
});

test("a shared given name is not a repeat offender", () => {
  // "Ravi" is doing all the work in each pairing; identity-resolve's thin-name
  // cap is what keeps three different Ravis from becoming one alert.
  const clusters = clusterRepeatAccused([
    rec({ name: "Ravi Kumar" }),
    rec({ name: "Ravi Shetty", age: 41 }),
    rec({ name: "Ravi Gowda", age: 27 }),
  ]);
  assert.equal(clusters.length, 0);
});

test("age drifting with the calendar still resolves to one person", () => {
  const clusters = clusterRepeatAccused([
    rec({ age: 34, registered: "2026-01-05" }),
    rec({ age: 35, registered: "2027-02-05" }),
    rec({ age: 36, registered: "2028-03-05" }),
  ]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].size, 3);
});

test("two files are never enough — a finding needs three distinct cases", () => {
  assert.equal(clusterRepeatAccused([rec(), rec()]).length, 0);
});

test("several files of one case do not inflate the count", () => {
  const shared = 4242;
  const clusters = clusterRepeatAccused([
    rec({ caseId: shared }),
    rec({ caseId: shared }),
    rec({ caseId: shared }),
  ]);
  assert.equal(clusters.length, 0, "three accused rows on one FIR is one case, not three");
});

test("the reported confidence is the cluster's weakest link, not its best", () => {
  const clusters = clusterRepeatAccused([
    rec({ age: 34, registered: "2026-01-05" }),
    rec({ age: 34, registered: "2026-01-06" }),
    // Same name and gender, age off by two — inside tolerance, but weaker.
    rec({ age: 36, registered: "2026-01-07", district: "Mysuru" }),
  ]);
  assert.equal(clusters.length, 1);
  const best = Math.max(...clusters[0].scored.map((c) => c.confidence));
  assert.ok(clusters[0].confidence < best, `${clusters[0].confidence} should be below best ${best}`);
});

test("every member carries the reasons that put it there", () => {
  const clusters = clusterRepeatAccused([rec(), rec(), rec()]);
  assert.equal(clusters.length, 1);
  assert.ok(clusters[0].scored.length >= 2);
  for (const c of clusters[0].scored) {
    assert.ok(c.reasons.length > 0);
    assert.ok(c.reasons.some((r) => r.signal === "name"));
  }
});

test("PersonID is never consulted — the corpus crutch stays out of the scorer", () => {
  const withTruth = clusterRepeatAccused([
    rec({ personId: "KSP-P-1" }),
    rec({ personId: "KSP-P-2" }),
    rec({ personId: "KSP-P-3" }),
  ]);
  const withoutTruth = clusterRepeatAccused([rec(), rec(), rec()]);
  assert.deepEqual(
    withTruth.map((c) => c.size),
    withoutTruth.map((c) => c.size)
  );
});
