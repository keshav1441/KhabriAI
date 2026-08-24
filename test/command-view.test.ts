import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFigures,
  dataOf,
  formatBottleneck,
  panelFromResponse,
  pickHottestDistrict,
  severityColor,
  severityTone,
  summariseMapPoints,
  TONE_COLOR,
  type FigureInputs,
  type ForecastDistrict,
  type QualityPayload,
} from "../lib/command-summary";

// Shaping only — no fetch, no database, no rendering. The payloads are
// hand-built so the assembly rules are the only thing under test.

const label = (stage: string) => stage.toUpperCase();

const district = (name: string, predicted: number, delta: number): ForecastDistrict => ({
  districtId: name.length,
  district: name,
  predicted,
  delta,
  confidence: "medium",
});

/** Every panel loaded, every number present — the baseline the failures are compared against. */
function healthy(): FigureInputs {
  return {
    pendency: { state: "ok", data: { summary: { openCases: 412, overdue: 37, noArrest: 88, medianAgeDays: 64 } } },
    custody: { state: "ok", data: { summary: { noneBroughtIn: 21, csNoCustody: 4, liveCases: 300 } } },
    alerts: { state: "ok", data: { unread: 3, last24h: 5 } },
    forecast: { state: "ok", data: { forecast: { districts: [district("Kolar", 90, 4)] } } },
    pipeline: { state: "ok", data: { totalCases: 900, bottleneck: { stage: "chargesheet", fromStage: "arrested", medianDays: 41, reached: 512 } } },
    quality: { state: "ok", data: { report: { score: 82, failingChecks: 3 } } },
  };
}

const figure = (inputs: FigureInputs, id: string) => buildFigures(inputs, label).find((f) => f.id === id);

test("a healthy load fills every figure", () => {
  const figures = buildFigures(healthy(), label);
  assert.equal(figures.find((f) => f.id === "openCases")?.value, "412");
  assert.equal(figures.find((f) => f.id === "overdue")?.value, "37");
  assert.equal(figures.find((f) => f.id === "unreadAlerts")?.value, "3");
  assert.equal(figures.find((f) => f.id === "hottestDistrict")?.value, "Kolar");
  assert.equal(figures.find((f) => f.id === "bottleneck")?.value, "41d");
});

test("a failed panel leaves its figure blank, never zero", () => {
  const inputs = healthy();
  inputs.pendency = { state: "failed" };
  const overdue = figure(inputs, "overdue");
  assert.equal(overdue?.value, null, "an unknown overdue count must not read as 0");
  // And it must not be painted as good news either.
  assert.equal(overdue?.tone, "neutral");
  assert.equal(figure(inputs, "openCases")?.value, null);
  // The panels that did load are untouched by their neighbour's failure.
  assert.equal(figure(inputs, "unreadAlerts")?.value, "3");
});

test("a panel still loading is blank rather than zero", () => {
  const inputs = healthy();
  inputs.custody = null;
  assert.equal(figure(inputs, "noneBroughtIn")?.value, null);
});

test("a genuine zero is still printed as zero", () => {
  const inputs = healthy();
  inputs.pendency = { state: "ok", data: { summary: { openCases: 0, overdue: 0, noArrest: 0, medianAgeDays: null } } };
  assert.equal(figure(inputs, "overdue")?.value, "0");
  // Nothing overdue is not an alarm.
  assert.equal(figure(inputs, "overdue")?.tone, "neutral");
  assert.equal(figure(inputs, "openCases")?.note, null, "a missing median must not invent a sub-line");
});

test("a 403 on data quality is absence, not failure", () => {
  assert.equal(panelFromResponse(403, null).state, "unavailable");
  assert.equal(panelFromResponse(401, null).state, "unavailable");

  const inputs = healthy();
  inputs.quality = panelFromResponse<QualityPayload>(403, null);
  assert.equal(figure(inputs, "dataQuality"), undefined, "a non-reviewer gets no tile at all");
  // Every other figure survives the refusal.
  assert.equal(buildFigures(inputs, label).length, 6);
});

test("a data-quality endpoint that actually broke keeps its slot, blank", () => {
  const inputs = healthy();
  inputs.quality = panelFromResponse<QualityPayload>(500, null);
  const dq = figure(inputs, "dataQuality");
  assert.equal(dq?.value, null);
  assert.equal(dq?.note, null);
});

test("panelFromResponse separates refusal, failure and a body that never arrived", () => {
  assert.deepEqual(panelFromResponse(200, { unread: 2 }), { state: "ok", data: { unread: 2 } });
  assert.equal(panelFromResponse(500, { error: "boom" }).state, "failed");
  assert.equal(panelFromResponse(200, null).state, "failed", "a body that would not parse is a failure");
  assert.equal(dataOf(panelFromResponse(500, null)), null);
});

test("the headline breaks a tie by trend, then by name, so it never flickers", () => {
  const tied = [district("Mysuru", 120, 3), district("Ballari", 120, 9)];
  assert.equal(pickHottestDistrict(tied)?.district, "Ballari", "same projection, faster climb wins");

  const dead = [district("Mysuru", 120, 3), district("Ballari", 120, 3)];
  assert.equal(pickHottestDistrict(dead)?.district, "Ballari", "identical on both, alphabetical decides");

  // And the same tie through the band, not just the picker.
  const inputs = healthy();
  inputs.forecast = { state: "ok", data: { forecast: { districts: tied } } };
  assert.equal(figure(inputs, "hottestDistrict")?.value, "Ballari");
});

test("no district with enough history leaves the headline blank", () => {
  const inputs = healthy();
  inputs.forecast = { state: "ok", data: { forecast: { districts: [] } } };
  assert.equal(figure(inputs, "hottestDistrict")?.value, null);
  assert.equal(pickHottestDistrict(undefined), null);
});

test("the bottleneck sentence names both legs and stays silent without one", () => {
  assert.equal(
    formatBottleneck({ stage: "chargesheet", fromStage: "arrested", medianDays: 41, reached: 512 }, label),
    "ARRESTED → CHARGESHEET · 512 cases"
  );
  assert.equal(formatBottleneck(null, label), null);

  const inputs = healthy();
  inputs.pipeline = { state: "ok", data: { totalCases: 900, bottleneck: null } };
  assert.equal(figure(inputs, "bottleneck")?.value, null);
  assert.equal(figure(inputs, "bottleneck")?.note, null);
});

test("severity colours match the alert bell, and an unknown severity is not an alarm", () => {
  assert.equal(severityColor("critical"), TONE_COLOR.critical);
  assert.equal(severityColor("warning"), TONE_COLOR.warning);
  assert.equal(severityTone("something-new"), "info");
  assert.equal(severityColor(null), TONE_COLOR.info);
});

test("the map summary counts placed points only", () => {
  const shares = summariseMapPoints({
    points: [
      { district: "Kolar", lat: 13, lng: 78 },
      { district: "Kolar", lat: 13.1, lng: 78.1 },
      { district: "Udupi", lat: 13.3, lng: 74.7 },
      // No coordinates: counted by the endpoint as missing, never as a district hit.
      { district: "Udupi", lat: null, lng: null },
    ],
    total: 4,
    missingCoords: 1,
  });
  assert.deepEqual(shares.map((s) => [s.district, s.count]), [["Kolar", 2], ["Udupi", 1]]);
  assert.equal(shares[0].share, 2 / 3);
  assert.deepEqual(summariseMapPoints({ points: [{ district: "Kolar", lat: null, lng: null }] }), []);
  assert.deepEqual(summariseMapPoints(null), []);
});
