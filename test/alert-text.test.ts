import { test } from "node:test";
import assert from "node:assert/strict";
import { english, renderFinding } from "../lib/alertText";
import { STRINGS } from "../lib/i18n";

/**
 * Findings are stored as values plus a type, and the sentence is built at read
 * time. What that buys is a Kannada rendering of a row written in English; what
 * it risks is a row that renders as a raw template, or one whose stored English
 * drifts from the displayed English. Both are checked here.
 */

const SPIKE = { district: "Kolar", pct: 21, thisMonth: 34, lastMonth: 28 };

test("a finding renders in both languages from one set of stored values", () => {
  const en = renderFinding({ kind: "spike", title: "", detail: "", params: SPIKE }, "en");
  assert.equal(en.title, "Crime spike in Kolar");
  assert.equal(en.detail, "21% jump last month (34 vs 28 the month before)");

  const kn = renderFinding({ kind: "spike", title: "", detail: "", params: SPIKE }, "kn");
  assert.ok(kn.title.includes("ಕೋಲಾರ"), "district is translated, not passed through");
  assert.ok(!kn.title.includes("Kolar"));
  assert.ok(kn.detail.includes("21"), "the numbers survive");
});

test("the stored English is the same string the reader sees", () => {
  // english() and renderFinding(..., "en") must not be two wordings.
  const stored = english("spike", SPIKE);
  const shown = renderFinding({ kind: "spike", ...stored, params: SPIKE }, "en");
  assert.deepEqual(shown, stored);
});

test("a row written before params falls back to its stored sentence", () => {
  const row = { kind: "spike", title: "Crime spike in Kolar", detail: "21% jump", params: null };
  assert.deepEqual(renderFinding(row, "kn"), { title: "Crime spike in Kolar", detail: "21% jump" });
});

test("an unknown detector type keeps its stored sentence rather than a template name", () => {
  const row = { kind: "not_a_detector", title: "Something", detail: "happened", params: { a: 1 } };
  const out = renderFinding(row, "kn");
  assert.equal(out.title, "Something");
  assert.ok(!out.detail.includes("finding."));
});

test("a `Kn` twin overrides its base param in Kannada and is dropped in English", () => {
  // The duplicate detector renders its reason clause in both languages up
  // front, because rebuilding it needs signal values the row does not carry.
  const params = {
    label: "A/1", matchLabel: "B/2", registered: "2026-08-20", matchRegistered: "2026-08-21",
    pct: 91, where: "both at Kolar Town", whereKn: "ಎರಡೂ Kolar Town ಠಾಣೆಯಲ್ಲಿ",
    why: "same complainant", whyKn: "ಒಬ್ಬರೇ ದೂರುದಾರ",
  };
  const en = renderFinding({ kind: "duplicate", title: "", detail: "", params }, "en");
  assert.ok(en.detail.includes("same complainant"));
  assert.ok(!en.detail.includes("ಒಬ್ಬರೇ"), "the Kannada twin never leaks into English");

  const kn = renderFinding({ kind: "duplicate", title: "", detail: "", params }, "kn");
  assert.ok(kn.detail.includes("ಒಬ್ಬರೇ ದೂರುದಾರ"));
  assert.ok(!kn.detail.includes("same complainant"));
});

test("the far district's copy uses the name-stripped template", () => {
  const base = {
    label: "A/1", matchLabel: "B/2", registered: "r", matchRegistered: "r",
    pct: 91, where: "w", why: "y",
  };
  const near = renderFinding({ kind: "duplicate", title: "", detail: "", params: base }, "en");
  const far = renderFinding({ kind: "duplicate", title: "", detail: "", params: { ...base, unnamed: 1 } }, "en");
  assert.ok(!near.detail.includes("out of your posting"));
  assert.ok(far.detail.includes("out of your posting"));
});

test("every finding template exists in both languages with matching placeholders", () => {
  const keys = Object.keys(STRINGS).filter((k) => k.startsWith("finding.") || k.startsWith("dup.reason."));
  assert.ok(keys.length > 0);
  for (const k of keys) {
    const { en, kn } = STRINGS[k as keyof typeof STRINGS];
    assert.ok(kn.trim().length, `${k} has no Kannada`);
    // A placeholder present in one language and missing in the other means a
    // value silently disappears for readers of that language.
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(holes(kn), holes(en), `${k}: placeholders differ between en and kn`);
  }
});
