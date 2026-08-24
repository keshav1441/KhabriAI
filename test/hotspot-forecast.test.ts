import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fitTrend } from "../lib/hotspot-forecast";

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
