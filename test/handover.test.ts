import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveOutstanding, type OutstandingInput } from "../lib/handover";
import { chargesheetClock } from "../lib/pendency";

// The "what is outstanding" derivation only — no database, no network. The
// clock is always constructed from an explicit age, so these assertions mean
// the same thing next year.

const base: OutstandingInput = {
  chargesheetFiled: false,
  clock: chargesheetClock(10, "Non-Heinous"),
  accusedAtLarge: [],
  sectionCount: 2,
  hasNarrative: true,
};

const kinds = (i: OutstandingInput) => deriveOutstanding(i).items.map((x) => x.kind);
const labelOf = (i: OutstandingInput, kind: string) =>
  deriveOutstanding(i).items.find((x) => x.kind === kind)?.label ?? "";

test("an overdue clock appears, with the days it is overdue by", () => {
  const input = { ...base, clock: chargesheetClock(75, "Non-Heinous") };
  const out = deriveOutstanding(input);
  const cs = out.items.find((i) => i.kind === "chargesheet");
  assert.ok(cs, "the chargesheet deadline should be listed");
  assert.equal(cs.severity, "urgent");
  assert.match(cs.label, /overdue by 15 days/);
  assert.match(cs.label, /60-day limit/);
  assert.equal(out.clear, false);
});

test("a clock still running reports the days left, not an overdue warning", () => {
  const cs = deriveOutstanding(base).items.find((i) => i.kind === "chargesheet");
  assert.ok(cs);
  assert.equal(cs.severity, "open");
  assert.match(cs.label, /50 days left/);
});

test("an accused never brought in is listed by name", () => {
  const input = { ...base, accusedAtLarge: ["Ravi Kumar"] };
  assert.ok(kinds(input).includes("accusedAtLarge"));
  assert.match(labelOf(input, "accusedAtLarge"), /1 accused named but never brought in — Ravi Kumar\./);
});

test("several accused at large are counted and named", () => {
  const input = { ...base, accusedAtLarge: ["Ravi Kumar", "Mahesh B"] };
  assert.match(labelOf(input, "accusedAtLarge"), /^2 accused named but never brought in — Ravi Kumar, Mahesh B\.$/);
});

test("a chargesheeted case shows no chargesheet deadline", () => {
  // Even sitting far past the statutory limit: the limit was met when the
  // chargesheet was filed, so a countdown here would be chasing a done thing.
  const input = { ...base, chargesheetFiled: true, clock: chargesheetClock(400, "Non-Heinous") };
  assert.ok(!kinds(input).includes("chargesheet"));
});

test("missing sections and missing narrative are both listed", () => {
  const input = { ...base, sectionCount: 0, hasNarrative: false };
  const k = kinds(input);
  assert.ok(k.includes("sections"));
  assert.ok(k.includes("narrative"));
  assert.match(labelOf(input, "sections"), /No act or sections/);
  assert.match(labelOf(input, "narrative"), /No brief facts/);
});

test("no FIR date means the clock is declared missing, not assumed", () => {
  const input = { ...base, clock: null };
  const label = labelOf(input, "chargesheet");
  assert.match(label, /no statutory clock can be run/);
});

test("a case with everything done reports nothing outstanding, not an empty section", () => {
  const input: OutstandingInput = {
    chargesheetFiled: true,
    clock: chargesheetClock(30, "Heinous"),
    accusedAtLarge: [],
    sectionCount: 3,
    hasNarrative: true,
  };
  const out = deriveOutstanding(input);
  assert.equal(out.clear, true);
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].kind, "none");
  assert.match(out.items[0].label, /Nothing outstanding/);
});
