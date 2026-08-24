import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fitTrend, monthBuckets } from "../lib/hotspot-forecast";

// The projection an officer is asked to act on is this line. It has to be
// arithmetic anyone can check, and it has to say when it does not fit.

test("recovers the slope and intercept of a straight line exactly", () => {
  const { slope, intercept, fit } = fitTrend([2, 4, 6, 8, 10, 12]);
  assert.equal(Number(slope.toFixed(6)), 2);
  assert.equal(Number(intercept.toFixed(6)), 2);
  assert.equal(Number(fit.toFixed(6)), 1);
});

test("a flat series has no trend and nothing to explain", () => {
  const { slope, fit } = fitTrend([5, 5, 5, 5, 5, 5]);
  assert.equal(slope, 0);
  assert.equal(fit, 0); // zero variance — the line explains nothing, and says so
});

test("reports a falling trend as negative, not as magnitude", () => {
  const { slope } = fitTrend([12, 10, 8, 6, 4, 2]);
  assert.ok(slope < 0, `expected a negative slope, got ${slope}`);
});

test("noise around a level scores a poor fit", () => {
  const { fit } = fitTrend([4, 9, 3, 10, 2, 8]);
  assert.ok(fit < 0.3, `zig-zag should not look like a trend, got fit=${fit}`);
});

test("a clean rise scores a strong fit", () => {
  const { fit, slope } = fitTrend([3, 4, 6, 7, 9, 10]);
  assert.ok(fit > 0.9, `got fit=${fit}`);
  assert.ok(slope > 1);
});

test("projection one step past the fitted window is intercept + slope * n", () => {
  const y = [1, 3, 5, 7, 9, 11];
  const { slope, intercept } = fitTrend(y);
  assert.equal(Math.round(intercept + slope * y.length), 13);
});

// The SQL side buckets months with DATE_TRUNC on a GMT session. Building these
// from LOCAL months instead means that between 00:00 and 05:30 IST on the first
// of a month the two disagree - the oldest month is dropped and the newest is
// zero-filled, which turns every rising district into a falling one.
test("month buckets follow the SQL session's UTC months, not the server's local ones", () => {
  const justAfterMidnightIST = new Date("2026-08-31T19:00:00Z"); // 01 Sep, 00:30 IST
  const buckets = monthBuckets(6, justAfterMidnightIST);

  assert.deepEqual(buckets, ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]);
  // In IST that instant is already September, so a local-month build would have
  // asked for Mar-Aug and left August empty.
  assert.ok(!buckets.includes("2026-08"));
});

test("the fitted window is always the completed months before now", () => {
  const buckets = monthBuckets(6, new Date("2026-08-24T12:00:00Z"));
  assert.equal(buckets.length, 6);
  assert.equal(buckets[buckets.length - 1], "2026-07"); // never the running month
});
