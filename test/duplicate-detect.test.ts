import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreDuplicate, bestNameMatch, DUP, type DuplicateSignals } from "../lib/duplicate-detect";

// The scoring is what the drawer and the alert engine both assert on, so the
// question it has to get right is not "are these alike" but "is this the SAME
// EVENT written twice" — and it has to be wrong in the safe direction.

const signals = (over: Partial<DuplicateSignals> = {}): DuplicateSignals => ({
  narrative: 0.5,
  dayGap: null,
  station: "otherDistrict",
  sameSubHead: false,
  personMatch: 0,
  ...over,
});

test("everything agreeing is a near-certain duplicate", () => {
  const r = scoreDuplicate(
    signals({
      narrative: 0.99,
      dayGap: 0,
      station: "same",
      sameSubHead: true,
      personMatch: 1,
      personLabel: "Ramesh Gowda",
    })
  );
  assert.ok(r.likelihood >= 0.95, `got ${r.likelihood}`);
  assert.equal(r.isProbable, true);
  assert.equal(r.capped, null);
});

test("an almost identical narrative alone stays below the bar", () => {
  // The classic false positive: a stock-phrased chain-snatching FIR reads like
  // every other chain-snatching FIR. Nobody in either file matches.
  const r = scoreDuplicate(signals({ narrative: 0.97, dayGap: 1, station: "same", sameSubHead: true }));
  assert.ok(r.likelihood < DUP.threshold, `got ${r.likelihood}`);
  assert.equal(r.isProbable, false);
  assert.equal(r.capped, "no-person");
});

test("same crime type and same week, different people, does not trigger", () => {
  // Two burglaries on one street in one week. Everything circumstantial agrees.
  const r = scoreDuplicate(
    signals({ narrative: 0.88, dayGap: 3, station: "same", sameSubHead: true, personMatch: 0.2 })
  );
  assert.equal(r.isProbable, false, `got ${r.likelihood}`);
});

test("matching people cannot rescue narratives about different events", () => {
  // Same victim, robbed twice in a fortnight — two crimes, not one file typed
  // twice. The narrative gate is what says so.
  const r = scoreDuplicate(
    signals({ narrative: 0.7, dayGap: 2, station: "same", sameSubHead: true, personMatch: 1 })
  );
  assert.equal(r.capped, "weak-narrative");
  assert.ok(r.likelihood <= DUP.weakNarrativeCap, `got ${r.likelihood}`);
  assert.equal(r.isProbable, false);
});

test("the cross-station filing is still caught", () => {
  // The case the feature exists for: one incident reported at two stations.
  const r = scoreDuplicate(
    signals({ narrative: 0.95, dayGap: 1, station: "otherDistrict", sameSubHead: true, personMatch: 0.95 })
  );
  assert.equal(r.isProbable, true, `got ${r.likelihood}`);
  assert.equal(r.reasons.find((x) => x.signal === "station"), undefined, "a different district is not a reason to believe");
});

test("the reasons returned are exactly the signals that fired", () => {
  const r = scoreDuplicate(
    signals({ narrative: 0.99, dayGap: 0, station: "same", sameSubHead: false, personMatch: 1, personLabel: "Ramesh Gowda" })
  );
  const fired = r.reasons.map((x) => x.signal).sort();
  assert.deepEqual(fired, ["date", "narrative", "people", "station"]);
  // The sub-head did not agree, so it must not be claimed as a reason.
  assert.ok(!fired.includes("crimeType"));
  assert.ok(r.reasons.some((x) => x.label.includes("Ramesh Gowda")));
  assert.ok(r.reasons.some((x) => x.label === "Same incident date"));
  // Heaviest contribution first — the "why" line should lead with what mattered.
  assert.deepEqual(r.reasons.map((x) => x.weight), [...r.reasons.map((x) => x.weight)].sort((a, b) => b - a));
});

test("a stale date is not corroboration", () => {
  const near = scoreDuplicate(signals({ narrative: 0.95, dayGap: 0, station: "same", sameSubHead: true, personMatch: 1 }));
  const far = scoreDuplicate(signals({ narrative: 0.95, dayGap: 7, station: "same", sameSubHead: true, personMatch: 1 }));
  assert.ok(far.likelihood < near.likelihood);
  assert.equal(far.reasons.find((x) => x.signal === "date"), undefined);
});

test("an unknown date neither helps nor blocks", () => {
  const r = scoreDuplicate(signals({ narrative: 0.97, dayGap: null, station: "same", sameSubHead: true, personMatch: 1 }));
  assert.equal(r.isProbable, true, `got ${r.likelihood}`);
  assert.equal(r.reasons.find((x) => x.signal === "date"), undefined);
});

test("names match through honorifics and clerical noise", () => {
  const a = bestNameMatch(["Sri Ramesh Gowda"], ["RAMESH GOWDA"]);
  assert.ok(a.score >= DUP.personGate, `got ${a.score}`);
  // Once the noise is stripped the two are the same string, so the label is the
  // name itself rather than a "this / that" pair.
  assert.equal(a.label, "Sri Ramesh Gowda");

  // Different people must not be talked into being the same one.
  const b = bestNameMatch(["Ramesh Gowda"], ["Suresh Kumar"]);
  assert.ok(b.score < DUP.personGate, `got ${b.score}`);
  assert.equal(b.label, null);
});

test("a complainant in one file matching a victim in the other counts", () => {
  // Roles get swapped between two write-ups of one incident all the time.
  const { score } = bestNameMatch(["Lakshmi Bai"], ["Nagaraj S", "Lakshmi Bai"]);
  assert.ok(score >= DUP.personGate, `got ${score}`);
});
