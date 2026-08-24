import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectMisuse, personNamesIn, districtsIn, hasCaseRef, istHour, type TrailRun } from "../lib/misuse";

// Scoring only — no database, no network. Runs are hand-built so the thresholds
// are the only thing under test. The cases that matter most here are the ones
// that must NOT fire: a signal that flags ordinary police work is worse than no
// signal at all.

const NOW = new Date("2026-08-24T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

let seq = 0;
function run(over: Partial<TrailRun> & { at: Date }): TrailRun {
  return {
    runId: `run-${++seq}`,
    officer: "d.rao@ksp.gov.in",
    role: "HQ",
    scope: "Statewide",
    question: "a question",
    personNames: [],
    districts: [],
    maxRows: 3,
    hasCaseRef: false,
    ...over,
  };
}

/** `n` runs spaced `gapMin` apart, starting `hoursAgo` before NOW. */
function series(n: number, over: Partial<TrailRun>, hoursAgo = 4, gapMin = 10): TrailRun[] {
  const start = NOW.getTime() - hoursAgo * 60 * 60 * 1000;
  return Array.from({ length: n }, (_, i) => run({ ...over, at: new Date(start + i * gapMin * 60 * 1000) }));
}

const signals = (runs: TrailRun[]) => detectMisuse(runs, NOW, 30).findings.map((f) => f.signal);

test("an empty trail produces no findings and no ranked officers", () => {
  const report = detectMisuse([], NOW, 30);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.byOfficer, []);
  assert.equal(report.runsExamined, 0);
  assert.equal(report.officers, 0);
  // The gaps are always reported, so a clean run is never mistaken for full coverage.
  assert.ok(report.notCovered.length > 0);
});

test("one repeated name search does not fire", () => {
  // Three lookups of the same person is a follow-up, not a pattern. An
  // investigator does this constantly and must never be flagged for it.
  const runs = series(3, { personNames: ["suresh kumar"] });
  assert.deepEqual(signals(runs), []);
});

test("a burst of the same name in one afternoon fires, and cites the runs behind it", () => {
  const runs = series(6, { personNames: ["suresh kumar"] });
  const findings = detectMisuse(runs, NOW, 30).findings.filter((f) => f.signal === "repeat-person");
  assert.equal(findings.length, 1);
  const [f] = findings;
  assert.equal(f.severity, "elevated");
  assert.equal(f.officer, "d.rao@ksp.gov.in");
  assert.equal(f.runs.length, 6);
  assert.match(f.detail, /suresh kumar/);
  // Every card carries the innocent reading; the concern never stands alone.
  assert.ok(f.benign.length > 0);
});

test("the same burst with a case number quoted drops a severity band", () => {
  const runs = series(6, { personNames: ["suresh kumar"] });
  runs[2].hasCaseRef = true;
  const [f] = detectMisuse(runs, NOW, 30).findings.filter((x) => x.signal === "repeat-person");
  assert.equal(f.severity, "moderate");
  assert.match(f.benign, /case number/);
});

test("the same name searched across separate weeks is not a burst", () => {
  const runs = [0, 7, 14, 21].map((d) =>
    run({ at: new Date(NOW.getTime() - d * DAY), personNames: ["suresh kumar"] })
  );
  assert.ok(!signals(runs).includes("repeat-person"));
});

test("five distinct names in one sitting fires a sweep; the same names with a case do not", () => {
  const names = ["a raj", "b naik", "c gowda", "d shetty", "e patil"];
  const sweep = names.map((n, i) =>
    run({ at: new Date(NOW.getTime() - (60 - i * 5) * 60 * 1000), personNames: [n] })
  );
  assert.ok(signals(sweep).includes("name-sweep"));

  // Several people inside one case file is exactly what an investigation looks like.
  const withCase = sweep.map((r, i) => ({ ...r, hasCaseRef: i === 0 }));
  assert.ok(!signals(withCase).includes("name-sweep"));

  // Spread across days it is not one sitting either.
  const spread = names.map((n, i) => run({ at: new Date(NOW.getTime() - i * DAY), personNames: [n] }));
  assert.ok(!signals(spread).includes("name-sweep"));
});

test("an officer's own baseline is respected: a heavy user's normal day is not a burst", () => {
  // Thirty runs every day for a fortnight. Every one of those days is far above
  // BURST_FLOOR, and none of them is a change in this officer's behaviour.
  const runs: TrailRun[] = [];
  for (let d = 0; d < 14; d++) {
    for (let i = 0; i < 30; i++) {
      runs.push(run({ at: new Date(NOW.getTime() - d * DAY - i * 60 * 1000) }));
    }
  }
  assert.ok(!signals(runs).includes("volume-burst"));

  // The same officer suddenly doing 120 in a day is the thing worth asking about.
  const spike = [...runs, ...Array.from({ length: 90 }, (_, i) =>
    run({ at: new Date(NOW.getTime() - 15 * DAY - i * 60 * 1000) })
  )];
  const burst = detectMisuse(spike, NOW, 30).findings.filter((f) => f.signal === "volume-burst");
  assert.equal(burst.length, 1);
  assert.equal(burst[0].severity, "low");
  assert.match(burst[0].detail, /against a usual 30 per active day/);
});

test("a quiet officer's ordinary morning is not a burst either", () => {
  // Median of 1-2 runs a day; a five-run morning is 3x the baseline but nowhere
  // near BURST_FLOOR, which is what the floor is there to prevent.
  const runs: TrailRun[] = [];
  for (let d = 1; d < 10; d++) runs.push(run({ at: new Date(NOW.getTime() - d * DAY) }));
  runs.push(...series(5, {}, 5, 20));
  assert.ok(!signals(runs).includes("volume-burst"));
});

test("bulk row counts fire, and ordinary result sizes do not", () => {
  assert.ok(!signals(series(4, { maxRows: 60 })).includes("bulk-rows"));
  const big = detectMisuse([run({ at: NOW, maxRows: 4200 })], NOW, 30).findings;
  assert.deepEqual(big.map((f) => f.signal), ["bulk-rows"]);
  assert.equal(big[0].severity, "elevated");
});

test("statewide access narrowing onto one district fires; a steady spread does not", () => {
  const spread = ["Mysuru", "Ballari", "Kodagu", "Dharwad"];
  const earlier = Array.from({ length: 8 }, (_, i) =>
    run({ at: new Date(NOW.getTime() - (25 - i) * DAY), districts: [spread[i % spread.length]] })
  );
  const focused = Array.from({ length: 8 }, (_, i) =>
    run({ at: new Date(NOW.getTime() - (10 - i) * DAY), districts: ["Kodagu"] })
  );
  const narrowed = detectMisuse([...earlier, ...focused], NOW, 30).findings.filter(
    (f) => f.signal === "district-narrowing"
  );
  assert.equal(narrowed.length, 1);
  assert.match(narrowed[0].title, /Kodagu/);

  // The same officer carrying on across the state is not narrowing.
  const steady = Array.from({ length: 16 }, (_, i) =>
    run({ at: new Date(NOW.getTime() - (25 - i) * DAY), districts: [spread[i % spread.length]] })
  );
  assert.ok(!signals(steady).includes("district-narrowing"));

  // A district-scoped officer working their own district is the job, not a signal.
  const sho = focused.map((r) => ({ ...r, scope: "Kodagu" }));
  assert.ok(!signals([...earlier.map((r) => ({ ...r, scope: "Kodagu" })), ...sho]).includes("district-narrowing"));
});

test("an off-hours cluster fires, but a night-duty officer is not flagged for working nights", () => {
  // 01:30 IST = 20:00 UTC the day before.
  const night = (hoursBack: number) => new Date(Date.UTC(2026, 7, 20, 20, 0) - hoursBack * 60 * 1000);
  const dayWork = Array.from({ length: 30 }, (_, i) =>
    run({ at: new Date(Date.UTC(2026, 7, 21, 6, 0) + i * 5 * 60 * 1000) })
  );
  const cluster = Array.from({ length: 6 }, (_, i) => run({ at: night(i * 10) }));
  assert.ok(signals([...dayWork, ...cluster]).includes("off-hours"));

  // The same cluster from someone who only ever works nights is a roster fact.
  assert.ok(!signals(cluster).includes("off-hours"));
});

test("a busy but unremarkable officer scores nothing at all", () => {
  // Forty runs a day, every day, none repeating a name, none oversized. Volume
  // alone must never put anybody on this page.
  const runs: TrailRun[] = [];
  for (let d = 0; d < 20; d++) {
    for (let i = 0; i < 40; i++) {
      runs.push(
        run({
          at: new Date(NOW.getTime() - d * DAY - i * 12 * 60 * 1000),
          districts: [["Mysuru", "Ballari", "Kodagu", "Dharwad"][i % 4]],
          maxRows: 25,
        })
      );
    }
  }
  const report = detectMisuse(runs, NOW, 30);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.byOfficer, []);
});

test("findings from different officers are ranked by weight, not by activity", () => {
  const sweeper = series(5, { officer: "a@ksp.gov.in", personNames: [] }).map((r, i) => ({
    ...r,
    personNames: [`name ${i}`],
  }));
  const bulky = [run({ officer: "b@ksp.gov.in", at: NOW, maxRows: 700 })];
  const report = detectMisuse([...sweeper, ...bulky], NOW, 30);
  assert.equal(report.byOfficer[0].officer, "a@ksp.gov.in"); // elevated (3) over moderate (2)
  assert.deepEqual(report.byOfficer.map((o) => o.score), [3, 2]);
  assert.equal(report.findings[0].severity, "elevated");
});

test("person filters are read out of SQL literals, not out of selected columns", () => {
  const lookup = `{"sql":"SELECT * FROM \\"Accused\\" a WHERE a.\\"AccusedName\\" ILIKE '%Suresh Kumar%'"}`;
  assert.deepEqual(personNamesIn(lookup), ["suresh kumar"]);

  // Listing repeat accused selects the name column and filters on nobody. This
  // is the single most important non-firing case in the module.
  const analysis = `{"sql":"SELECT a.\\"AccusedName\\", COUNT(*) FROM \\"Accused\\" a GROUP BY 1"}`;
  assert.deepEqual(personNamesIn(analysis), []);

  // buildCrewDossier names a person directly, with no SQL in between.
  assert.deepEqual(personNamesIn(`{"personName":"Ravi Shetty","topK":5}`), ["ravi shetty"]);
});

test("district literals and case references are recognised", () => {
  assert.deepEqual(districtsIn(`d."DistrictName" = 'Bengaluru Urban' AND x = 1`), ["Bengaluru Urban"]);
  assert.deepEqual(districtsIn(`SELECT d."DistrictName" FROM "District" d`), []);
  assert.ok(hasCaseRef(`Show cases like FIR 100150104202513778`));
  assert.ok(hasCaseRef(`{"crimeNo":"100150104202513778"}`));
  assert.ok(!hasCaseRef(`How many FIRs were filed in Mysuru last month?`));
});

test("timestamps are read on the officers' clock, not UTC", () => {
  // 20:00 UTC is 01:30 IST — off-hours for the officer, mid-evening in UTC.
  assert.equal(istHour(new Date("2026-08-20T20:00:00.000Z")), 1);
  assert.equal(istHour(new Date("2026-08-21T04:30:00.000Z")), 10);
});
