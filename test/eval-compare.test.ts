import { test } from "node:test";
import assert from "node:assert/strict";
import { resultsMatch } from "../eval/compare";

test("same values under different column aliases match", () => {
  assert.equal(resultsMatch([{ total_cases: 5 }], [{ n: 5 }]), true);
});

test("row order does not matter", () => {
  assert.equal(resultsMatch([{ a: 1 }, { a: 2 }], [{ a: 2 }, { a: 1 }]), true);
});

test("column order within a row does not matter", () => {
  assert.equal(resultsMatch([{ a: 1, b: "x" }], [{ b: "x", a: 1 }]), true);
});

test("different values do not match", () => {
  assert.equal(resultsMatch([{ a: 1 }], [{ a: 2 }]), false);
});

test("different row counts do not match", () => {
  assert.equal(resultsMatch([{ a: 1 }], [{ a: 1 }, { a: 1 }]), false);
});

test("bigint, number and numeric string compare equal", () => {
  assert.equal(resultsMatch([{ a: BigInt(3) }], [{ a: "3" }]), true);
});

test("Date and its ISO string compare equal", () => {
  const d = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(resultsMatch([{ a: d }], [{ a: "2026-01-01T00:00:00.000Z" }]), true);
});

test("row lists match on the set of CaseMasterIDs even if other columns differ", () => {
  const a = [{ CaseMasterID: 1, CrimeNo: "A" }, { CaseMasterID: 2, CrimeNo: "B" }];
  const b = [{ CaseMasterID: 2, UnitName: "X", Status: "UI" }, { CaseMasterID: 1, UnitName: "Y", Status: "UI" }];
  assert.equal(resultsMatch(a, b), true);
});

test("row lists with different CaseMasterIDs do not match", () => {
  assert.equal(resultsMatch([{ CaseMasterID: 1 }], [{ CaseMasterID: 3 }]), false);
});

test("numeric values compare at 2-decimal precision (AVG vs ROUND)", () => {
  assert.equal(resultsMatch([{ a: 31.456789 }], [{ a: "31.46" }]), true);
  assert.equal(resultsMatch([{ a: 31.456789 }], [{ a: "31.5" }]), false);
});

test("strings compare trimmed (TO_CHAR 'Day' pads with spaces)", () => {
  assert.equal(resultsMatch([{ d: "Monday   " }], [{ d: "Monday" }]), true);
});
