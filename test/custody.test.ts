import { test } from "node:test";
import assert from "node:assert/strict";
import { custodyPosition, matchesFilter, STALE_ACTION_DAYS, type CustodyRow } from "../lib/custody";
import { chargesheetClock } from "../lib/pendency";

// Derivation only — no database, no network. `now` is always passed in, so
// these assertions mean the same thing next year.

const NOW = new Date("2026-06-01T00:00:00Z");

function position(over: Partial<Parameters<typeof custodyPosition>[0]> = {}) {
  return custodyPosition({
    accusedCount: 1,
    broughtIn: 0,
    actions: 0,
    chargesheeted: false,
    lastActionDate: null,
    daysSinceFir: 10,
    clockDaysRemaining: 80,
    now: NOW,
    ...over,
  });
}

test("three accused with one arrest leaves two never brought in", () => {
  const p = position({ accusedCount: 3, broughtIn: 1, actions: 1, lastActionDate: "2026-05-30" });
  assert.equal(p.broughtIn, 1);
  assert.equal(p.neverBroughtIn, 2);
  assert.equal(p.coverage, 1 / 3);
  assert.equal(p.daysSinceLastAction, 2);
});

test("a charge-sheeted case with no custody action is flagged", () => {
  const p = position({ accusedCount: 2, broughtIn: 0, actions: 0, chargesheeted: true });
  assert.deepEqual(p.flags, ["csNoCustody"]);
});

test("a charge-sheeted case with someone brought in is not flagged", () => {
  const p = position({ accusedCount: 2, broughtIn: 2, actions: 2, chargesheeted: true, lastActionDate: "2026-01-01" });
  assert.deepEqual(p.flags, []);
});

test("a case whose only accused surrendered is not 'never brought in'", () => {
  // The record cannot say whether this was an arrest or a surrender — see the
  // note in lib/custody.ts — so a surrender counts exactly as an arrest does.
  const p = position({ accusedCount: 1, broughtIn: 1, actions: 1, lastActionDate: "2026-05-20" });
  assert.equal(p.neverBroughtIn, 0);
  assert.equal(p.coverage, 1);
  const row = { custody: p } as CustodyRow;
  assert.equal(matchesFilter(row, "none"), false);
});

test("a case with no accused recorded reports null coverage, not a division by zero", () => {
  const p = position({ accusedCount: 0, broughtIn: 0, actions: 0 });
  assert.equal(p.coverage, null);
  assert.equal(p.neverBroughtIn, 0);
  assert.ok(!Number.isNaN(p.coverage as unknown as number));
});

test("more custody records than accused cannot push coverage past everyone", () => {
  // An arrest can carry a null AccusedMasterID and one accused can have several
  // records; neither may report more people held than were ever named.
  const p = position({ accusedCount: 1, broughtIn: 4, actions: 4, lastActionDate: "2026-05-01" });
  assert.equal(p.broughtIn, 1);
  assert.equal(p.neverBroughtIn, 0);
  assert.equal(p.coverage, 1);
});

test("stale needs both silence and a clock running down", () => {
  const quietButEarly = position({ daysSinceFir: 40, clockDaysRemaining: 50 });
  assert.deepEqual(quietButEarly.flags, []);

  const quietAndLate = position({ daysSinceFir: 55, clockDaysRemaining: 5 });
  assert.deepEqual(quietAndLate.flags, ["stale"]);

  const recentActionAndLate = position({
    broughtIn: 1, actions: 1, lastActionDate: "2026-05-29", daysSinceFir: 55, clockDaysRemaining: 5,
  });
  assert.deepEqual(recentActionAndLate.flags, []);
});

test("silence is counted from the FIR when there has never been an action", () => {
  const p = position({ daysSinceFir: STALE_ACTION_DAYS, clockDaysRemaining: 0 });
  assert.equal(p.daysSinceLastAction, null);
  assert.deepEqual(p.flags, ["stale"]);
});

test("a charge-sheeted case is never stale — its clock has stopped", () => {
  const p = position({ chargesheeted: true, actions: 1, broughtIn: 1, lastActionDate: "2026-01-01", daysSinceFir: 120, clockDaysRemaining: -30 });
  assert.deepEqual(p.flags, []);
});

test("the flag thresholds line up with the statutory clock the desk shows", () => {
  // 80 days on a 90-day heinous clock: 10 left, inside the due-soon window.
  const clock = chargesheetClock(80, "Heinous");
  const p = position({ daysSinceFir: 80, clockDaysRemaining: clock.daysRemaining });
  assert.equal(clock.state, "dueSoon");
  assert.deepEqual(p.flags, ["stale"]);
});
