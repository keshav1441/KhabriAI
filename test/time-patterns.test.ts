import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketByHour,
  bucketByWeekday,
  bucketByMonth,
  bucketByWeekdayHour,
  weekdayIndex,
  shapeBuckets,
  detectPeak,
  uniformChiSquare,
  chiSquarePValue,
  describeHourWindow,
  describeWeekdayWindow,
  coverageWeights,
  goodnessOfFit,
  WEEKDAYS,
  SIGNIFICANCE,
} from "../lib/time-patterns";

// Bucketing and peak detection only — no database, no network, no clock of its
// own. Every date below is constructed explicitly, so these assertions mean the
// same thing whenever they are run.

// ---- Bucketing -------------------------------------------------------------

test("weekday buckets are Monday-first and do not wrap into each other", () => {
  // 2026-08-24 is a Monday.
  assert.equal(weekdayIndex(new Date(2026, 7, 24, 12)), 0);
  assert.equal(weekdayIndex(new Date(2026, 7, 30, 12)), 6); // Sunday
  assert.equal(WEEKDAYS[0], "Mon");
  assert.equal(WEEKDAYS[6], "Sun");
});

test("bucketing is correct across a week boundary", () => {
  // Sunday 23:00 and the Monday 00:00 one hour later are 60 minutes apart but
  // belong to opposite ends of the roster — the boundary must not smear.
  const sundayLate = new Date(2026, 7, 23, 23, 30);
  const mondayEarly = new Date(2026, 7, 24, 0, 15);
  const dow = bucketByWeekday([sundayLate, mondayEarly]);
  assert.equal(dow[6], 1, "Sunday 23:30 stays on Sunday");
  assert.equal(dow[0], 1, "Monday 00:15 starts a new week");
  assert.equal(dow.reduce((a, b) => a + b, 0), 2);

  const hours = bucketByHour([sundayLate, mondayEarly]);
  assert.equal(hours[23], 1);
  assert.equal(hours[0], 1);

  const grid = bucketByWeekdayHour([sundayLate, mondayEarly]);
  assert.equal(grid[6][23], 1);
  assert.equal(grid[0][0], 1);
  assert.equal(grid[6][0], 0, "the Sunday row must not pick up Monday's midnight");
});

test("month buckets are zero-based and cover a full year", () => {
  const dates = Array.from({ length: 12 }, (_, m) => new Date(2026, m, 15, 9));
  const months = bucketByMonth(dates);
  assert.deepEqual(months, Array(12).fill(1));
});

test("shapeBuckets folds pre-grouped rows into marginals that agree with the grid", () => {
  const rows = [
    { dow: 0, hour: 3, month: 0, n: 5 },
    { dow: 0, hour: 3, month: 1, n: 2 },
    { dow: 6, hour: 23, month: 0, n: 4 },
  ];
  const s = shapeBuckets(rows);
  assert.equal(s.total, 11);
  assert.equal(s.weekday[0], 7);
  assert.equal(s.weekday[6], 4);
  assert.equal(s.hour[3], 7);
  assert.equal(s.hour[23], 4);
  assert.equal(s.month[0], 9);
  assert.equal(s.grid[0][3], 7);
  assert.equal(s.grid[6][23], 4);
  // The grid must reconstruct the weekday marginal exactly, or a panel would
  // be telling a different story from the heat map beside it.
  s.grid.forEach((row, d) => assert.equal(row.reduce((a, b) => a + b, 0), s.weekday[d]));
});

test("shapeBuckets drops out-of-range buckets instead of folding them into Monday", () => {
  const s = shapeBuckets([
    { dow: 9, hour: 30, month: 40, n: 3 },
    { dow: 1, hour: 1, month: 1, n: 2 },
  ]);
  assert.equal(s.weekday[0], 0);
  assert.equal(s.weekday[1], 2);
  assert.equal(s.hour.reduce((a, b) => a + b, 0), 2);
  assert.equal(s.grid.flat().reduce((a, b) => a + b, 0), 2);
});

// ---- Is it a pattern? ------------------------------------------------------

test("a perfectly uniform distribution reports no peak", () => {
  const flat = Array(24).fill(500);
  const peak = detectPeak(flat, 4);
  assert.equal(peak.verdict, "flat");
  assert.deepEqual(peak.window, []);
  assert.equal(peak.chi2, 0);
  assert.ok(peak.p >= SIGNIFICANCE);
});

test("ordinary sampling wobble around a flat distribution is still no peak", () => {
  // The real corpus: 20,001 cases over 24 hours, expected 833 each. The tallest
  // hour is 900 — 8% above baseline — and it is still nothing. Pointing a shift
  // at it would be inventing a pattern.
  const observed = [
    823, 809, 809, 900, 795, 834, 798, 867, 837, 818, 864, 840,
    830, 847, 825, 862, 824, 798, 842, 805, 833, 849, 833, 859,
  ];
  const peak = detectPeak(observed, 4);
  assert.equal(peak.verdict, "flat", `chi2=${peak.chi2.toFixed(1)} p=${peak.p.toFixed(3)}`);
  assert.deepEqual(peak.window, []);
  assert.ok(peak.p > SIGNIFICANCE);
});

test("a genuine spike is identified, with the window and its lift", () => {
  // Baseline 100/hour, with the small hours carrying four times the load.
  const counts = Array(24).fill(100);
  for (const h of [22, 23, 0, 1]) counts[h] = 400;
  const peak = detectPeak(counts, 4);
  assert.equal(peak.verdict, "peak");
  assert.ok(peak.p < SIGNIFICANCE);
  // The window is contiguous and circular: it must be allowed to wrap midnight.
  assert.deepEqual(peak.window, [22, 23, 0, 1]);
  assert.equal(peak.observed, 1600);
  assert.ok(peak.lift > 2.5, `lift ${peak.lift}`);
  assert.equal(describeHourWindow(peak.window), "22:00–02:00");
});

test("a weekend-heavy week is identified and named", () => {
  const counts = [100, 100, 100, 100, 100, 300, 300]; // Mon…Sun
  const peak = detectPeak(counts, 2);
  assert.equal(peak.verdict, "peak");
  assert.deepEqual(peak.window, [5, 6]);
  assert.equal(describeWeekdayWindow(peak.window), "Sat–Sun");
});

test("too little data reports insufficient, not flat", () => {
  // Six cases across 24 hours: below 5 expected per bucket, chi-square means
  // nothing here. Absence of evidence must not read as evidence of flatness.
  const counts = Array(24).fill(0);
  counts[2] = 4;
  counts[3] = 2;
  const peak = detectPeak(counts, 4);
  assert.equal(peak.verdict, "insufficient");
  assert.deepEqual(peak.window, []);
});

test("empty input does not crash", () => {
  const peak = detectPeak([], 4);
  assert.equal(peak.verdict, "insufficient");
  assert.equal(peak.total, 0);
  assert.deepEqual(peak.window, []);

  const zeros = detectPeak(Array(24).fill(0), 4);
  assert.equal(zeros.verdict, "insufficient");
  assert.equal(zeros.total, 0);

  const s = shapeBuckets([]);
  assert.equal(s.total, 0);
  assert.equal(s.grid.length, 7);
  assert.equal(s.grid[0].length, 24);

  assert.deepEqual(bucketByHour([]), Array(24).fill(0));
  assert.equal(describeHourWindow([]), "");
  assert.equal(describeWeekdayWindow([]), "");
});

// ---- Uneven exposure -------------------------------------------------------

test("coverageWeights counts the days each weekday and month actually got", () => {
  // 2026-08-24 (Mon) to 2026-08-30 (Sun): exactly one of each weekday, all August.
  const c = coverageWeights(new Date(2026, 7, 24), new Date(2026, 7, 30));
  assert.deepEqual(c.weekday, Array(7).fill(1));
  assert.equal(c.month[7], 7);
  assert.equal(c.month.reduce((a, b) => a + b, 0), 7);
  assert.deepEqual(c.hour, Array(24).fill(1), "every covered day contains all 24 hours");

  // A 90-day window touches only part of the year.
  const q = coverageWeights(new Date(2026, 0, 1), new Date(2026, 2, 31));
  assert.equal(q.month[0], 31);
  assert.equal(q.month[1], 28);
  assert.equal(q.month[2], 31);
  assert.equal(q.month[6], 0, "July was never covered");
});

test("a short window cannot manufacture a season", () => {
  // Three months of even caseload. Against a flat twelfth-of-a-year expectation
  // this is wildly "significant"; against the days each month actually got, it
  // is exactly what it is — nothing.
  const counts = Array(12).fill(0);
  counts[0] = 310; counts[1] = 280; counts[2] = 310;
  const weights = coverageWeights(new Date(2026, 0, 1), new Date(2026, 2, 31)).month;

  assert.equal(detectPeak(counts, 1).verdict, "peak", "flat baseline is fooled by the calendar");
  const corrected = detectPeak(counts, 1, weights);
  assert.equal(corrected.verdict, "flat", `chi2=${corrected.chi2.toFixed(2)} p=${corrected.p.toFixed(3)}`);
  assert.equal(corrected.df, 2, "only the three covered months are tested");
});

test("a real seasonal spike survives the coverage correction", () => {
  const counts = Array(12).fill(0);
  counts[0] = 310; counts[1] = 280; counts[2] = 930; // March genuinely triples
  const weights = coverageWeights(new Date(2026, 0, 1), new Date(2026, 2, 31)).month;
  const peak = detectPeak(counts, 1, weights);
  assert.equal(peak.verdict, "peak");
  assert.deepEqual(peak.window, [2]);
  assert.ok(peak.lift > 1.7, `lift ${peak.lift}`);
});

test("the peak window is chosen by lift, not by raw count, when exposure is uneven", () => {
  // Bucket 0 was exposed twice as long as bucket 1 and has more cases outright,
  // but bucket 1 is the busier one per day. Ranking on the raw count would name
  // the wrong window.
  const counts = [200, 150, 100, 100, 100, 100, 100];
  const weights = [2, 1, 1, 1, 1, 1, 1];
  const peak = detectPeak(counts, 1, weights);
  assert.equal(peak.verdict, "peak");
  assert.deepEqual(peak.window, [1]);
});

// ---- The statistics themselves --------------------------------------------

test("uniformChiSquare matches a hand-computed statistic", () => {
  // Two buckets, 60/40 of 100: expected 50 each, chi2 = 2 * (10^2/50) = 4.
  const { chi2, df, expected } = uniformChiSquare([60, 40]);
  assert.equal(expected, 50);
  assert.equal(df, 1);
  assert.ok(Math.abs(chi2 - 4) < 1e-9);

  // Weighted 3:1, the same counts are almost exactly what was expected.
  const g = goodnessOfFit([60, 40], [1.5, 1]);
  assert.equal(g.expected[0], 60);
  assert.equal(g.expected[1], 40);
  assert.equal(g.chi2, 0);
  assert.deepEqual(g.active, [0, 1]);

  // A zero-exposure bucket is excluded, not counted as a shortfall.
  const z = goodnessOfFit([50, 50, 0], [1, 1, 0]);
  assert.deepEqual(z.active, [0, 1]);
  assert.equal(z.df, 1);
  assert.equal(z.chi2, 0);
});

test("the chi-square p-value brackets the textbook critical values", () => {
  // chi2(1) critical value at p=0.05 is 3.841; chi2(23) is 35.17.
  assert.ok(chiSquarePValue(3.841, 1) < 0.06 && chiSquarePValue(3.841, 1) > 0.04);
  assert.ok(chiSquarePValue(35.17, 23) < 0.06 && chiSquarePValue(35.17, 23) > 0.04);
  assert.equal(chiSquarePValue(0, 23), 1);
  assert.ok(chiSquarePValue(200, 23) < 1e-6);
});
