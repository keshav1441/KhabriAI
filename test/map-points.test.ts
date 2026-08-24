import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { thinPoints, withinBounds, cellDegForZoom, type IncidentPoint } from "../lib/map-points";

// The map's honesty lives here. Every number the officer reads — how many
// incidents are drawn, how many cases had no location at all — comes out of
// thinPoints, and the DOM budget that keeps 20k FIRs from freezing the tab is
// the cap in the same function. None of that needs a database to check.

let nextId = 1;
function p(lat: number | null, lng: number | null): IncidentPoint {
  return {
    id: nextId++,
    lat,
    lng,
    crimeNo: `CR-${nextId}`,
    crimeType: "Theft",
    crimeGroup: "Property",
    district: "Tumakuru",
    station: "Tumakuru Town PS",
    date: "2026-01-01",
  };
}

const WIDE = { cellDeg: 1, cap: 1000 };

test("points inside one grid cell collapse to a single weighted marker", () => {
  const r = thinPoints([p(13.31, 77.11), p(13.35, 77.19), p(13.39, 77.02)], WIDE);
  assert.equal(r.clusters.length, 1);
  assert.equal(r.clusters[0].count, 3);
  assert.equal(r.shown, 3);
});

test("the marker sits on the centroid of its incidents, not the cell corner", () => {
  const r = thinPoints([p(13.0, 77.0), p(13.4, 77.6)], WIDE);
  assert.equal(r.clusters.length, 1);
  assert.equal(Number(r.clusters[0].lat.toFixed(6)), 13.2);
  assert.equal(Number(r.clusters[0].lng.toFixed(6)), 77.3);
});

test("points in different cells stay apart", () => {
  const r = thinPoints([p(13.2, 77.2), p(15.8, 74.5)], WIDE);
  assert.equal(r.clusters.length, 2);
  assert.deepEqual(r.clusters.map((c) => c.count), [1, 1]);
});

test("a lone point keeps the case behind it, so the drawer can open it", () => {
  const only = p(12.97, 77.59);
  const r = thinPoints([only], WIDE);
  assert.equal(r.clusters[0].count, 1);
  assert.equal(r.clusters[0].sample.id, only.id);
});

test("a case without coordinates is excluded and counted, never silently dropped", () => {
  const r = thinPoints([p(13.2, 77.2), p(null, 77.2), p(13.2, null), p(null, null)], WIDE);
  assert.equal(r.shown, 1);
  assert.equal(r.missingCoords, 3);
  assert.equal(r.clusters.length, 1);
});

test("a non-finite coordinate counts as missing, not as a marker at NaN", () => {
  const r = thinPoints([p(NaN, 77.2), p(13.2, Infinity)], WIDE);
  assert.equal(r.clusters.length, 0);
  assert.equal(r.missingCoords, 2);
});

test("the cap limits admitted points and reports what it left out", () => {
  const many = Array.from({ length: 50 }, (_, i) => p(12 + i * 0.1, 75 + i * 0.1));
  const r = thinPoints(many, { cellDeg: 0.01, cap: 10 });
  assert.equal(r.shown, 10);
  assert.equal(r.omitted, 40);
  assert.equal(r.clusters.length, 10);
});

test("blank coordinates past the cap are still counted", () => {
  const r = thinPoints([p(13.1, 77.1), p(13.2, 77.2), p(null, null)], { cellDeg: 0.01, cap: 1 });
  assert.equal(r.shown, 1);
  assert.equal(r.omitted, 1);
  assert.equal(r.missingCoords, 1);
});

test("a cap of zero draws nothing rather than throwing", () => {
  const r = thinPoints([p(13.1, 77.1)], { cellDeg: 1, cap: 0 });
  assert.equal(r.clusters.length, 0);
  assert.equal(r.omitted, 1);
});

const BOX = { south: 12, west: 75, north: 14, east: 78 };

test("bounding-box filtering is inclusive on every edge", () => {
  const corners = [p(12, 75), p(14, 78), p(12, 78), p(14, 75), p(13, 76.5)];
  const r = thinPoints(corners, { cellDeg: 1, cap: 100, bounds: BOX });
  assert.equal(r.shown, 5);
  assert.equal(r.outOfBounds, 0);
});

test("points just outside the box are excluded and counted apart from missing ones", () => {
  const r = thinPoints([p(11.999, 76), p(14.001, 76), p(13, 74.999), p(13, 78.001), p(null, null)], {
    cellDeg: 1,
    cap: 100,
    bounds: BOX,
  });
  assert.equal(r.shown, 0);
  assert.equal(r.outOfBounds, 4);
  assert.equal(r.missingCoords, 1);
});

test("withinBounds agrees on the edges it is asked about directly", () => {
  assert.equal(withinBounds(12, 75, BOX), true);
  assert.equal(withinBounds(14, 78, BOX), true);
  assert.equal(withinBounds(11.9999, 75, BOX), false);
});

test("the grid tightens as the officer zooms in", () => {
  const statewide = cellDegForZoom(7);
  const street = cellDegForZoom(15);
  assert.ok(street < statewide, `${street} should be finer than ${statewide}`);
  assert.equal(Number((statewide / street).toFixed(6)), 256); // eight zoom levels, 2^8
  assert.ok(cellDegForZoom(NaN) > 0); // a map that has not settled must not divide by zero
});

test("the same cases thinned at street zoom stop being one marker", () => {
  const cases = [p(13.31, 77.11), p(13.35, 77.19), p(13.39, 77.02)];
  const coarse = thinPoints(cases, { cellDeg: cellDegForZoom(7), cap: 100 });
  const fine = thinPoints(cases, { cellDeg: cellDegForZoom(15), cap: 100 });
  assert.equal(coarse.clusters.length, 1);
  assert.equal(fine.clusters.length, 3);
  assert.equal(coarse.shown, fine.shown); // thinning changes markers, never the count reported
});
