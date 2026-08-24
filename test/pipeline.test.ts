import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBreakdown,
  buildStages,
  daysBetween,
  median,
  percentile,
  pickBottleneck,
  sampleDurations,
  slowestForStage,
  type CaseTimeline,
  type PipelineStage,
} from "../lib/pipeline";

// Stage and duration arithmetic only — no database, no network, no clock.
// Every date below is a literal, so these assertions mean the same thing in
// five years as they do today.

function caseAt(
  caseId: number,
  firDate: string,
  arrestDate: string | null,
  chargesheetDate: string | null,
  district = "Kolar",
  crimeGroup = "Theft"
): CaseTimeline {
  return { caseId, district, crimeGroup, firDate, arrestDate, chargesheetDate };
}

// ---- median ----------------------------------------------------------------

test("median over an odd count is the middle value", () => {
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([40]), 40);
});

test("median over an even count averages the two middle values", () => {
  assert.equal(median([1, 3, 5, 9]), 4);
  // Rounded, not truncated: 10 and 15 sit 12.5 apart.
  assert.equal(median([10, 15]), 13);
});

test("median of nothing is null, not zero", () => {
  assert.equal(median([]), null);
  assert.equal(percentile([], 0.9), null);
});

test("a long tail moves the mean but not the median", () => {
  // The reason the module refuses means: one five-year-old case would otherwise
  // define the whole district's number.
  const days = [10, 12, 14, 16, 1800];
  const mean = days.reduce((a, b) => a + b, 0) / days.length;
  assert.equal(median(days), 14);
  assert.ok(mean > 300);
});

test("p90 is the nearest-rank ninetieth percentile", () => {
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9);
  assert.equal(percentile([5, 5, 5], 0.9), 5);
});

test("daysBetween counts whole calendar days, UTC", () => {
  assert.equal(daysBetween("2025-01-01", "2025-01-31"), 30);
  assert.equal(daysBetween("2025-03-04", "2025-03-04"), 0);
  assert.equal(daysBetween("2025-03-10", "2025-03-04"), -6);
});

// ---- drop-off vs a zero-day transition -------------------------------------

test("a case that skips a stage is a drop-off, never a zero-day transition", () => {
  const s = sampleDurations([
    { from: "2025-01-01", to: "2025-01-11" },
    { from: "2025-01-01", to: null }, // never arrested
    { from: "2025-01-01", to: null },
  ]);
  assert.equal(s.reached, 1);
  assert.equal(s.notReached, 2);
  assert.deepEqual(s.days, [10]);
  // The killer detail: the median is 10, not 3 — the two missing cases must not
  // be smuggled in as zeros.
  assert.equal(median(s.days), 10);
});

test("the funnel counts the skipped stage as drop-off and keeps the median clean", () => {
  const rows = [
    caseAt(1, "2025-01-01", "2025-01-11", "2025-02-20"),
    caseAt(2, "2025-01-01", null, null), // never arrested, never charge-sheeted
    caseAt(3, "2025-01-01", "2025-01-21", null), // arrested, no chargesheet
  ];
  const stages = buildStages(rows);
  const by = Object.fromEntries(stages.map((s) => [s.id, s])) as Record<string, PipelineStage>;

  assert.equal(by.registered.reached, 3);
  assert.equal(by.registered.dropOff, 0);

  assert.equal(by.arrested.reached, 2);
  assert.equal(by.arrested.dropOff, 1);
  assert.equal(by.arrested.medianDaysFromFir, 15); // 10 and 20 → 15, the missing case excluded

  assert.equal(by.chargesheet.reached, 1);
  assert.equal(by.chargesheet.dropOff, 2);
  assert.ok(by.chargesheet.dropOffPct !== null && by.chargesheet.dropOffPct > 66);
  assert.equal(by.chargesheet.medianDaysFromFir, 50);
});

test("a case charge-sheeted with no arrest on record counts as reached but contributes no transition", () => {
  const s = sampleDurations([{ from: null, to: "2025-02-01" }]);
  assert.equal(s.reached, 1);
  assert.equal(s.notReached, 0);
  assert.deepEqual(s.days, []);
  assert.equal(median(s.days), null);
});

// ---- negative durations ----------------------------------------------------

test("a chargesheet dated before the FIR is excluded, not clamped to zero", () => {
  const s = sampleDurations([
    { from: "2025-01-01", to: "2025-02-10" }, // 40
    { from: "2025-01-01", to: "2025-02-20" }, // 50
    { from: "2025-03-01", to: "2025-02-01" }, // -28, real data has these
  ]);
  assert.equal(s.excludedNegative, 1);
  assert.deepEqual(s.days, [40, 50]);
  // Clamping the bad row to 0 would give a median of 40; dropping it gives 45.
  assert.equal(median(s.days), 45);
});

test("the negative row is excluded from the funnel but still counted as reached", () => {
  const rows = [
    caseAt(1, "2025-01-01", "2025-01-11", "2025-02-10"),
    caseAt(2, "2025-01-01", "2025-01-11", "2025-02-20"),
    caseAt(3, "2025-03-01", "2025-03-05", "2025-02-01"), // chargesheet before the FIR
  ];
  const cs = buildStages(rows).find((s) => s.id === "chargesheet")!;
  assert.equal(cs.reached, 3);
  assert.equal(cs.dropOff, 0);
  assert.equal(cs.medianDaysFromFir, 45);
  assert.equal(cs.excludedNegative, 1); // measured from the arrest, also negative
});

// ---- the bottleneck --------------------------------------------------------

test("the bottleneck is the largest median transition, not the largest total", () => {
  const rows = [
    // 5 days to arrest, then 55 more to the chargesheet.
    caseAt(1, "2025-01-01", "2025-01-06", "2025-03-02"),
    caseAt(2, "2025-01-01", "2025-01-06", "2025-03-02"),
    caseAt(3, "2025-01-01", "2025-01-06", "2025-03-02"),
  ];
  const b = pickBottleneck(buildStages(rows));
  assert.ok(b);
  assert.equal(b.stage, "chargesheet");
  assert.equal(b.fromStage, "arrested");
  assert.equal(b.medianDays, 55);
});

test("a fast chargesheet after a slow arrest makes the arrest the bottleneck", () => {
  const rows = [
    caseAt(1, "2025-01-01", "2025-03-01", "2025-03-08"),
    caseAt(2, "2025-01-01", "2025-03-01", "2025-03-08"),
  ];
  const b = pickBottleneck(buildStages(rows));
  assert.equal(b?.stage, "arrested");
  assert.equal(b?.medianDays, 59);
});

test("days-from-FIR would always name the last stage, so it is not what ranks them", () => {
  const rows = [caseAt(1, "2025-01-01", "2025-03-01", "2025-03-08")];
  const stages = buildStages(rows);
  const cs = stages.find((s) => s.id === "chargesheet")!;
  assert.equal(cs.medianDaysFromFir, 66); // larger than the arrest's 59...
  assert.equal(pickBottleneck(stages)?.stage, "arrested"); // ...but the step is only 7 days
});

test("no measurable transition means no bottleneck rather than a made-up one", () => {
  assert.equal(pickBottleneck(buildStages([])), null);
  assert.equal(pickBottleneck(buildStages([caseAt(1, "2025-01-01", null, null)])), null);
});

// ---- the court stage stays honest ------------------------------------------

test("the court stage is declared but never given a count or a duration", () => {
  const court = buildStages([caseAt(1, "2025-01-01", "2025-01-05", "2025-02-05")]).find((s) => s.id === "court")!;
  assert.equal(court.measured, false);
  assert.equal(court.reached, null);
  assert.equal(court.medianDaysFromFir, null);
  assert.equal(court.medianTransitionDays, null);
  assert.match(court.note ?? "", /CourtID/);
});

// ---- breakdowns ------------------------------------------------------------

test("the breakdown splits by key and ranks the worst drop-off first", () => {
  const rows = [
    caseAt(1, "2025-01-01", "2025-01-06", "2025-02-05", "Kolar"),
    caseAt(2, "2025-01-01", "2025-01-06", "2025-02-15", "Kolar"),
    caseAt(3, "2025-01-01", null, null, "Bidar"),
    caseAt(4, "2025-01-01", "2025-01-11", null, "Bidar"),
  ];
  const byDistrict = buildBreakdown(rows, (r) => r.district);
  assert.equal(byDistrict.length, 2);
  assert.equal(byDistrict[0].key, "Bidar");
  assert.equal(byDistrict[0].chargesheetDropOffPct, 100);
  assert.equal(byDistrict[0].medianToChargesheet, null);
  assert.equal(byDistrict[1].key, "Kolar");
  assert.equal(byDistrict[1].chargesheetDropOffPct, 0);
  assert.equal(byDistrict[1].medianToChargesheet, 40); // 35 and 45
});

test("the slowest list ranks by the bottleneck step and drops the negative rows", () => {
  const rows = [
    caseAt(1, "2025-01-01", "2025-01-05", "2025-02-05"), // 31 days arrest → chargesheet
    caseAt(2, "2025-01-01", "2025-01-05", "2025-04-05"), // 90
    caseAt(3, "2025-01-01", "2025-03-05", "2025-02-05"), // negative, excluded
    caseAt(4, "2025-01-01", null, "2025-02-05"), // no arrest date, no step to measure
  ];
  const slow = slowestForStage(rows, "chargesheet", 5);
  assert.deepEqual(slow.map((c) => [c.caseId, c.days]), [[2, 90], [1, 31]]);
});
