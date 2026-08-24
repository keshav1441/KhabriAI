import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chargesheetClock,
  chargesheetLimitDays,
  compareAttention,
  sortByAttention,
  summarise,
  daysSince,
  CS_LIMIT_GRAVE_DAYS,
  CS_LIMIT_STANDARD_DAYS,
  type AttentionInput,
  type PendencyRow,
} from "../lib/pendency";

// Clock arithmetic and ordering only — no database, no network. `now` is always
// passed in, so these assertions mean the same thing next year.

test("a 61-day-old non-heinous case is past its 60-day limit", () => {
  const c = chargesheetClock(61, "Non-Heinous");
  assert.equal(c.limitDays, CS_LIMIT_STANDARD_DAYS);
  assert.equal(c.state, "overdue");
  assert.equal(c.daysOverdue, 1);
  assert.equal(c.daysRemaining, -1);
});

test("a 59-day-old non-heinous case is due soon, not overdue", () => {
  const c = chargesheetClock(59, "Non-Heinous");
  assert.equal(c.state, "dueSoon");
  assert.equal(c.daysRemaining, 1);
  assert.equal(c.daysOverdue, 0);
});

test("day 60 exactly is still inside the 60-day limit", () => {
  assert.equal(chargesheetClock(60, "Non-Heinous").state, "dueSoon");
  assert.equal(chargesheetClock(60, "Non-Heinous").daysRemaining, 0);
});

test("the graver offence gets 90 days, so the same 61-day age is on track", () => {
  const c = chargesheetClock(61, "Heinous");
  assert.equal(c.limitDays, CS_LIMIT_GRAVE_DAYS);
  assert.equal(c.basis, "heinous");
  assert.equal(c.state, "onTrack");
  assert.equal(c.daysRemaining, 29);
});

test("unknown gravity falls back to the 90-day clock and says so", () => {
  const c = chargesheetClock(61, null);
  assert.equal(c.limitDays, CS_LIMIT_GRAVE_DAYS);
  assert.equal(c.basis, "assumed");
  assert.equal(chargesheetLimitDays(undefined).basis, "assumed");
});

const row = (o: Partial<AttentionInput> & { caseId: number }): AttentionInput => ({
  daysSinceFir: 0,
  hasArrest: true,
  riskProbability: 0.5,
  clock: { daysRemaining: 100 },
  ...o,
});

test("ordering puts the most overdue case first", () => {
  const mostOverdue = row({ caseId: 1, clock: { daysRemaining: -40 } });
  const slightlyOverdue = row({ caseId: 2, clock: { daysRemaining: -2 } });
  const dueSoon = row({ caseId: 3, clock: { daysRemaining: 5 } });
  const comfortable = row({ caseId: 4, clock: { daysRemaining: 70 } });

  const ranked = sortByAttention([comfortable, dueSoon, slightlyOverdue, mostOverdue]);
  assert.deepEqual(ranked.map((r) => r.caseId), [1, 2, 3, 4]);
});

test("on the same clock, the case with no arrest is ranked first", () => {
  const arrested = row({ caseId: 10, hasArrest: true, clock: { daysRemaining: -3 } });
  const notArrested = row({ caseId: 11, hasArrest: false, clock: { daysRemaining: -3 } });
  assert.equal(compareAttention(notArrested, arrested) < 0, true);
  assert.deepEqual(sortByAttention([arrested, notArrested]).map((r) => r.caseId), [11, 10]);
});

test("ordering is stable for genuinely identical cases", () => {
  const a = row({ caseId: 7 });
  const b = row({ caseId: 3 });
  assert.deepEqual(sortByAttention([a, b]).map((r) => r.caseId), [3, 7]);
});

// The desk is built from rows the SQL already filtered — a chargesheeted case
// never reaches the ranking. This asserts the contract the query encodes: what
// the desk summarises is exactly what it was handed.
const deskRow = (caseId: number, daysSinceFir: number, gravity: string | null, hasArrest: boolean): PendencyRow => ({
  caseId,
  crimeNo: `CR${caseId}`,
  caseNo: null,
  dateRegistered: null,
  crimeGroup: "Crimes Against Property",
  station: "Station",
  district: "District",
  status: "Under Investigation",
  gravity,
  court: null,
  nextHearingDate: null,
  daysSinceFir,
  hasArrest,
  arrestCount: hasArrest ? 1 : 0,
  clock: chargesheetClock(daysSinceFir, gravity),
  riskProbability: hasArrest ? 0.4 : 0.02,
  risk: { probability: hasArrest ? 0.4 : 0.02, label: "x", contributions: [] },
});

test("an already-chargesheeted case is not on the desk at all", () => {
  const open = [deskRow(1, 61, "Non-Heinous", false), deskRow(2, 10, "Heinous", true)];
  // Case 3 was charge-sheeted, so the query never returns it.
  const s = summarise(open);
  assert.equal(s.openCases, 2);
  assert.equal(open.some((r) => r.caseId === 3), false);
});

test("the summary counts overdue, no-arrest and the median age", () => {
  const s = summarise([
    deskRow(1, 100, "Non-Heinous", false), // overdue, no arrest
    deskRow(2, 61, "Non-Heinous", true),   // overdue
    deskRow(3, 10, "Heinous", true),       // on track
  ]);
  assert.equal(s.openCases, 3);
  assert.equal(s.overdue, 2);
  assert.equal(s.noArrest, 1);
  assert.equal(s.medianAgeDays, 61);
});

test("daysSince counts whole calendar days in UTC", () => {
  assert.equal(daysSince(new Date("2026-01-01T00:00:00Z"), new Date("2026-03-03T23:00:00Z")), 61);
  assert.equal(daysSince("2026-03-03", new Date("2026-03-03T23:00:00Z")), 0);
});
