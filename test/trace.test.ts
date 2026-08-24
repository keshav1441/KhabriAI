import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTrace, type TraceCall } from "../lib/agent/trace";

// The trace is the only thing standing between an officer and "because the
// computer said so". These tests pin the parts a reviewer would actually
// challenge: that a failed step is still shown, that a corrected query admits
// what went wrong first, and that an answer with no SQL is still traceable.

const STATEWIDE = { districtName: null };

const call = (over: Partial<TraceCall> = {}): TraceCall => ({
  tool: "queryDatabase",
  status: "ok",
  durationMs: 120,
  result: { status: "ok", sql: "SELECT 1", rows: [{ n: 1 }] },
  ...over,
});

test("a run with no SQL tool still produces a valid trace", () => {
  const trace = buildTrace({
    calls: [call({ tool: "checkInsights", result: { status: "ok", insights: [{ title: "spike" }] } })],
    scope: STATEWIDE,
    totalMs: 900,
  });

  assert.equal(trace.sql, undefined);
  assert.equal(trace.rowCount, 0);
  assert.deepEqual(trace.examples, []);
  assert.deepEqual(trace.substitutions, []);
  assert.deepEqual(trace.tools.map((t) => t.tool), ["checkInsights"]);
  assert.equal(trace.scope.districtName, null);
  assert.equal(trace.totalMs, 900);
});

test("a repaired query surfaces both the original error and the corrected SQL", () => {
  const trace = buildTrace({
    calls: [
      call({
        result: {
          status: "ok",
          sql: 'SELECT COUNT(*) FROM "CaseMaster"',
          rows: [{ count: 7 }],
          repaired: true,
          repairError: 'column "Distrct" does not exist',
        },
      }),
    ],
    scope: STATEWIDE,
    totalMs: 1500,
  });

  assert.equal(trace.repaired, true);
  assert.equal(trace.repairError, 'column "Distrct" does not exist');
  assert.equal(trace.sql, 'SELECT COUNT(*) FROM "CaseMaster"');
});

test("durations, row counts, examples and substitutions map through", () => {
  const trace = buildTrace({
    calls: [
      call({
        durationMs: 340,
        result: {
          status: "ok",
          sql: "SELECT * FROM x",
          rows: [{ a: 1 }, { a: 2 }, { a: 3 }],
          fewShot: [{ question: "cases per district", score: 0.91 }],
          substitutions: [{ column: "DistrictName", from: "Belgavi", to: "Belagavi" }],
        },
      }),
    ],
    scope: { districtName: "Belagavi" },
    totalMs: 2200,
  });

  assert.equal(trace.tools[0].durationMs, 340);
  assert.equal(trace.rowCount, 3);
  assert.deepEqual(trace.examples, [{ question: "cases per district", score: 0.91 }]);
  assert.deepEqual(trace.substitutions, [{ column: "DistrictName", from: "Belgavi", to: "Belagavi" }]);
  assert.equal(trace.scope.districtName, "Belagavi");
});

test("a tool that errored is represented, with its message, not dropped", () => {
  const trace = buildTrace({
    calls: [
      call({ tool: "findSimilarCases", status: "error", durationMs: 55, result: { status: "error", message: "No embedded narratives" } }),
      call({ durationMs: 200 }),
    ],
    scope: STATEWIDE,
    totalMs: 800,
  });

  assert.equal(trace.tools.length, 2);
  assert.deepEqual(trace.tools[0], { tool: "findSimilarCases", status: "error", durationMs: 55, error: "No embedded narratives" });
  // The successful query still supplies the SQL and the rows.
  assert.equal(trace.sql, "SELECT 1");
  assert.equal(trace.rowCount, 1);
});

test("rows from a non-SQL tool still give an honest row count", () => {
  const trace = buildTrace({
    calls: [call({ tool: "buildCrewDossier", result: { status: "ok", rows: [{ name: "A" }, { name: "B" }] } })],
    scope: STATEWIDE,
    totalMs: 400,
  });

  assert.equal(trace.sql, undefined);
  assert.equal(trace.rowCount, 2);
});

test("the groundedness verdict rides along when the narrative has been checked", () => {
  const trace = buildTrace({
    calls: [call()],
    scope: STATEWIDE,
    totalMs: 100,
    groundedness: { grounded: false, checked: 1, claims: [{ value: 412, text: "412", supported: false, reason: "not found" }] },
  });

  assert.equal(trace.groundedness?.grounded, false);
  assert.equal(trace.groundedness?.checked, 1);
});

test("a failed query's SQL is never paired with another tool's row count", () => {
  const trace = buildTrace({
    calls: [
      call({ status: "error", result: { status: "error", sql: "SELECT bad", message: "column does not exist" } }),
      call({ tool: "buildCrewDossier", result: { status: "ok", rows: [{ name: "A" }, { name: "B" }, { name: "C" }] } }),
    ],
    scope: STATEWIDE,
    totalMs: 400,
  });

  assert.equal(trace.sql, "SELECT bad");
  // The query returned nothing; showing the dossier's three rows beside its SQL
  // would tell an officer the failed query worked.
  assert.equal(trace.rowCount, 0);
});
