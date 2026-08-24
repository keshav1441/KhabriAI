import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGroundedness, extractClaims } from "../lib/groundedness";

const qr = (rows: Record<string, unknown>[]) => ({ status: "ok", sql: "SELECT 1", rows, vizType: "table" });

/** The one claim the narrative made, whatever the order of extraction. */
function claimFor(verdict: ReturnType<typeof checkGroundedness>, value: number) {
  const c = verdict.claims.find((x) => x.value === value);
  assert.ok(c, `no claim extracted for ${value}`);
  return c;
}

test("a number present in the returned rows is grounded", () => {
  const v = checkGroundedness("Bengaluru Urban recorded **142** cases.", [qr([{ district: "Bengaluru Urban", cases: 142 }])]);
  assert.equal(v.checked, 1);
  assert.equal(v.grounded, true);
  assert.equal(claimFor(v, 142).supported, true);
});

test("thousands separators are read as one figure", () => {
  const v = checkGroundedness("A total of **1,284** FIRs were registered.", [qr([{ cases: 1284 }])]);
  assert.equal(v.grounded, true);
  assert.equal(claimFor(v, 1284).supported, true);
});

test("a number absent from the data is not grounded", () => {
  const v = checkGroundedness("Bengaluru Urban recorded **500** cases.", [qr([{ district: "Bengaluru Urban", cases: 142 }])]);
  assert.equal(v.checked, 1);
  assert.equal(v.grounded, false);
  assert.equal(claimFor(v, 500).supported, false);
  assert.match(claimFor(v, 500).reason, /not found/);
});

test("a row count is grounded even though it appears in no cell", () => {
  const rows = [{ crimeNo: "A" }, { crimeNo: "B" }, { crimeNo: "C" }];
  const v = checkGroundedness("There are 3 linked cases.", [qr(rows)]);
  assert.equal(v.grounded, true);
  assert.match(claimFor(v, 3).reason, /number of rows/);
});

test("a column total is an accepted derivation", () => {
  const v = checkGroundedness("Across the three districts there were **60** cases.", [
    qr([{ district: "A", cases: 10 }, { district: "B", cases: 20 }, { district: "C", cases: 30 }]),
  ]);
  assert.equal(v.grounded, true);
  assert.match(claimFor(v, 60).reason, /sum/);
});

test("years, dates, CrimeNo and section numbers are references, not claims", () => {
  const v = checkGroundedness(
    "In 2024, CrimeNo 123456789012345678 was registered on 2024-03-11 under Section 302 IPC.",
    [qr([])]
  );
  assert.equal(v.checked, 0);
  assert.equal(v.grounded, true);
  assert.deepEqual(v.claims, []);
});

test("list ordinals are not claims", () => {
  const claims = extractClaims("1. Mysuru\n2. Hassan\n3. Kalaburagi");
  assert.deepEqual(claims, []);
});

test("a four-digit count followed by a unit word is still checked", () => {
  const v = checkGroundedness("The district saw 2024 cases.", [qr([{ cases: 7 }])]);
  assert.equal(v.checked, 1);
  assert.equal(v.grounded, false);
});

test("a percentage derived from two returned numbers is accepted", () => {
  const v = checkGroundedness("Chargesheets were filed in **25%** of the 200 cases.", [
    qr([{ chargesheeted: 50, total: 200 }]),
  ]);
  assert.equal(v.grounded, true);
  assert.match(claimFor(v, 25).reason, /percentage/);
});

test("a returned fraction stated as a percentage is accepted", () => {
  const v = checkGroundedness("The model puts chargesheet likelihood at **62%**.", [
    { status: "ok", label: "Chargesheeted", probability: 0.62, source: "local" },
  ]);
  assert.equal(v.grounded, true);
  assert.match(claimFor(v, 62).reason, /fraction/);
});

test("an invented percentage is not accepted", () => {
  const v = checkGroundedness("Chargesheets were filed in **73%** of cases.", [
    qr([{ chargesheeted: 50, total: 200 }]),
  ]);
  assert.equal(v.grounded, false);
  assert.equal(claimFor(v, 73).supported, false);
});

test("an empty narrative does not crash and is grounded by default", () => {
  const v = checkGroundedness("", [qr([{ cases: 1 }])]);
  assert.deepEqual(v, { grounded: true, claims: [], checked: 0 });
});

test("empty rows, no tool results at all, and junk input do not crash", () => {
  assert.equal(checkGroundedness("Found 4 cases.", [qr([])]).grounded, false);
  assert.equal(checkGroundedness("Found 4 cases.", []).grounded, false);
  assert.equal(checkGroundedness("No records matched.", []).checked, 0);
  // Defensive: the orchestrator must never be able to break the answer with a
  // malformed tool payload.
  assert.equal(checkGroundedness("Found 4 cases.", [null, undefined, "oops", 7] as unknown[]).checked, 1);
});

test("an error result contributes no supporting numbers", () => {
  const v = checkGroundedness("There were **12** arrests.", [{ status: "error", message: "Query failed after 12 attempts" }]);
  assert.equal(v.grounded, false);
});

test("the same figure repeated counts once", () => {
  const v = checkGroundedness("142 cases, of which 142 are open.", [qr([{ cases: 142 }])]);
  assert.equal(v.checked, 1);
});

// A figure the officer put in the question is the question coming back. Flagging
// it would put a warning on a correct answer, which is how a guard loses its
// meaning.
test("a window echoed from the question is not a claim", () => {
  const v = checkGroundedness(
    "In the last 30 days, **36 FIRs** were filed in Ballari.",
    [{ rows: [{ n: 36 }] }],
    "How many FIRs were filed in Ballari in the last 30 days?"
  );
  assert.equal(v.grounded, true, JSON.stringify(v.claims));
  assert.ok(!v.claims.some((c) => c.value === 30), "the window should not be checked at all");
});

test("a duration is not a claim even when the question is missing", () => {
  const v = checkGroundedness("Cases rose over the last 6 months to **12**.", [{ rows: [{ n: 12 }] }]);
  assert.equal(v.grounded, true, JSON.stringify(v.claims));
});

test("\"top 5\" describes the request, not the data", () => {
  const v = checkGroundedness("The top 5 districts are led by Mysuru with **22** cases.", [{ rows: [{ n: 22 }] }]);
  assert.equal(v.grounded, true, JSON.stringify(v.claims));
});

test("an invented figure is still caught when a window is present", () => {
  const v = checkGroundedness(
    "In the last 30 days there were **500** cases.",
    [{ rows: [{ n: 36 }] }],
    "How many in the last 30 days?"
  );
  assert.equal(v.grounded, false);
  assert.ok(v.claims.some((c) => c.value === 500 && !c.supported));
});

// --- The gaps a real answer walked through -----------------------------------

test("a case narrative returned as BriefFacts does not vouch for the numbers in it", () => {
  // The key a queryDatabase row actually carries is cm."BriefFacts" - the
  // camelCase entry in PROSE_KEYS never matched it, so the whole narrative
  // became supporting data and any figure quoted out of it read as grounded.
  const v = checkGroundedness("Officers recovered **47** gold chains worth **1,284** rupees.", [
    qr([{ CrimeNo: "100030015202619999", BriefFacts: "47 gold chains worth 1,284 rupees were taken" }]),
  ]);
  assert.equal(v.checked, 2);
  assert.equal(v.grounded, false);
  assert.equal(claimFor(v, 47).supported, false);
  assert.equal(claimFor(v, 1284).supported, false);
});

test("a hyphenated compound is a figure, not a time window", () => {
  const v = checkGroundedness("The victim was **17**-year-old.", [qr([{ age: 17 }])]);
  assert.equal(v.checked, 1);
  assert.equal(claimFor(v, 17).supported, true);
});

test("an invented age in a hyphenated compound is caught", () => {
  const v = checkGroundedness("A **9**-year-old victim was named.", [qr([{ age: 17 }])]);
  assert.equal(v.grounded, false);
});

test("Indian digit grouping reads as one figure", () => {
  const v = checkGroundedness("Property worth Rs 5,00,000 was recovered.", [qr([{ recovered: 500000 }])]);
  assert.equal(v.checked, 1);
  assert.equal(claimFor(v, 500000).supported, true);
});

test("a lakh-grouped figure nobody returned is not grounded", () => {
  const v = checkGroundedness("Property worth Rs 1,23,456 was recovered.", [qr([{ recovered: 500000 }])]);
  assert.equal(v.grounded, false);
  assert.equal(claimFor(v, 123456).supported, false);
});

test("Kannada numerals in a Kannada answer are checked, not ignored", () => {
  const grounded = checkGroundedness("ಒಟ್ಟು ೧೪೨ ಪ್ರಕರಣಗಳು ದಾಖಲಾಗಿವೆ.", [qr([{ cases: 142 }])]);
  assert.equal(grounded.checked, 1);
  assert.equal(grounded.grounded, true);

  const invented = checkGroundedness("ಒಟ್ಟು ೫೦೦ ಪ್ರಕರಣಗಳು ದಾಖಲಾಗಿವೆ.", [qr([{ cases: 142 }])]);
  assert.equal(invented.checked, 1);
  assert.equal(invented.grounded, false);
});

test("a Kannada year is still a reference, not a claim", () => {
  const v = checkGroundedness("೨೦೨೪ ರಲ್ಲಿ ದಾಖಲಾಗಿದೆ.", [qr([])]);
  assert.equal(v.checked, 0);
});

test("a percentage is only a share of a column total or of two figures on one row", () => {
  // Every number below is returned, and the old rule tried all of them against
  // each other: one district's arrests over another district's caseload is
  // 36%, a figure this result set does not mean anywhere.
  const v = checkGroundedness("**36%** of cases ended in a chargesheet.", [
    qr([
      { district: "Mysuru", cases: 9, arrests: 4 },
      { district: "Hassan", cases: 11, arrests: 6 },
    ]),
  ]);
  assert.equal(v.grounded, false, JSON.stringify(v.claims));
});

test("a share of a returned column total is still accepted", () => {
  const v = checkGroundedness("Mysuru carries **45%** of the caseload.", [
    qr([
      { district: "Mysuru", cases: 9 },
      { district: "Hassan", cases: 11 },
    ]),
  ]);
  assert.equal(v.grounded, true, JSON.stringify(v.claims));
  assert.match(claimFor(v, 45).reason, /percentage/);
});
