import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { executeTool, capForLLM } from "../lib/agent/orchestrator";
import { runSearchRelatedCases, runBuildCrewDossier, runQueryDatabase } from "../lib/agent/tools";
import { scopeInsights } from "../lib/insights-cache";

// Tool arguments are written by the planner, so their declared types are a
// suggestion. These pin the two halves of the fix: every executor coerces what
// it is handed, and nothing a tool does can end the run instead of the step.

type Args = Record<string, unknown>;

test("a numeric CrimeNo does not throw on the way into a tool", async () => {
  // The planner's JSON for an "18-digit CrimeNo" - a number, not a string.
  const result = await runQueryDatabase({ crimeNo: 100030015202619999 } as unknown as { question: string }, []);
  assert.equal(result.status, "error");
  assert.match(result.message ?? "", /Missing question/);
});

test("an object argument is not searched for as if it were text", async () => {
  const result = await runSearchRelatedCases({ query: { chain: "snatching" } } as unknown as { query: string });
  assert.equal(result.status, "error");
  assert.match(result.message ?? "", /Missing query/);
});

test("a non-numeric caseId leaves the dossier tool asking for a seed, not throwing", async () => {
  const result = await runBuildCrewDossier({ caseId: "not-a-number" } as unknown as { caseId: number });
  assert.equal(result.status, "error");
  assert.match(result.message ?? "", /Give a case/);
});

test("every risk argument is coerced, so string counts still predict", async () => {
  const { status, value } = await executeTool(
    "predictRisk",
    {
      crimeType: "Crimes Against Property",
      district: "Mysuru",
      victimCount: "1",
      accusedCount: "2",
      daysSinceRegistered: "40",
      hasArrest: "true",
    },
    []
  );
  assert.equal(status, "ok");
  assert.equal((value as { source?: string }).source, "local");
});

test("an unknown tool is an error result, not a rejection", async () => {
  const { status, value } = await executeTool("noSuchTool", {}, []);
  assert.equal(status, "error");
  assert.match((value as { message: string }).message, /Unknown tool/);
});

test("a tool that throws becomes that tool's error, not the end of the run", async () => {
  // Args that throw on any property read - the shape no signature anticipates.
  const hostile = new Proxy({} as Args, {
    get() {
      throw new Error("boom");
    },
  });
  const { status, value } = await executeTool("predictRisk", hostile, []);
  assert.equal(status, "error");
  assert.match((value as { message: string }).message, /predictRisk failed: boom/);
});

// ---------------------------------------------------------------------------
// What the planner is allowed to carry forward
// ---------------------------------------------------------------------------

test("rows and their duplicate in priorities are both capped", () => {
  const cells = Array.from({ length: 90 }, (_, i) => ({ rank: i + 1, district: "Mysuru", projected: i }));
  const capped = capForLLM({ status: "ok", rows: cells, priorities: cells }) as Record<string, unknown>;
  assert.equal((capped.rows as unknown[]).length, 40);
  assert.equal((capped.priorities as unknown[]).length, 40);
  assert.equal(capped.rowsTruncated, 90);
});

test("a dossier too big to carry is trimmed, keeping the summary it is read for", () => {
  const bulky = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: i, briefFacts: "x".repeat(400), via: "co-accused" }));
  const capped = capForLLM({
    status: "ok",
    rows: [{ name: "A" }],
    dossier: { summary: { cases: 40, members: 9 }, signature: ["duplicate key"], cases: bulky(40), edges: bulky(40) },
  }) as Record<string, unknown>;

  assert.ok(JSON.stringify(capped).length <= 8000, "still oversized after trimming");
  const dossier = capped.dossier as Record<string, unknown>;
  assert.deepEqual(dossier.summary, { cases: 40, members: 9 });
  assert.deepEqual(dossier.signature, ["duplicate key"]);
  assert.equal(capped.payloadTruncated, true);
});

test("a small result is carried through untouched", () => {
  const value = { status: "ok", rows: [{ district: "Mysuru", cases: 12 }] };
  assert.deepEqual(capForLLM(value), value);
});

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

const MYSURU = 3;
const KALABURAGI = 7;

test("a district officer's insights lose the other districts and the named repeat suspect", () => {
  const insights = [
    { type: "spike", title: "Mysuru burglary spike", detail: "", query: "", districtId: MYSURU },
    { type: "spike", title: "Kalaburagi spike", detail: "", query: "", districtId: KALABURAGI },
    { type: "weekly_surge", title: "Statewide surge", detail: "", query: "", districtId: null },
    { type: "repeat_suspect", title: "Ravi Kumar, 6 cases", detail: "", query: "", districtId: null },
  ];
  const scoped = scopeInsights(insights, MYSURU);
  assert.deepEqual(scoped.map((i) => i.title), ["Mysuru burglary spike", "Statewide surge"]);
});

test("an HQ officer keeps every insight", () => {
  const insights = [{ type: "repeat_suspect", title: "Ravi Kumar", detail: "", query: "", districtId: null }];
  assert.deepEqual(scopeInsights(insights, null), insights);
});
