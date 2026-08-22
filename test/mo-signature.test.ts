import { test } from "node:test";
import assert from "node:assert/strict";
import { moSignature, CREW_TRAITS, OFFENCE_TRAITS } from "../lib/mo-signature";

const KEY = "KSP-P-00238|Crimes Against Property";

test("the same series key always yields the same signature", () => {
  assert.deepEqual(moSignature(KEY, "Crimes Against Property", "Burglary"), moSignature(KEY, "Crimes Against Property", "Burglary"));
});

test("crew traits are shared across a series even when the specific crime differs", () => {
  const a = moSignature(KEY, "Crimes Against Property", "Burglary");
  const b = moSignature(KEY, "Crimes Against Property", "Cheating");
  for (const t of CREW_TRAITS) assert.equal(a[t], b[t], `crew trait ${t} should match across the series`);
});

test("offence traits follow the specific crime type", () => {
  const burglary = moSignature(KEY, "Crimes Against Property", "Burglary");
  const cheating = moSignature(KEY, "Crimes Against Property", "Cheating");
  for (const t of OFFENCE_TRAITS) {
    assert.ok(burglary[t] && cheating[t], `offence trait ${t} present`);
    assert.notEqual(burglary[t], cheating[t], `offence trait ${t} should differ between Burglary and Cheating`);
  }
});

test("different series get different crew signatures", () => {
  const a = moSignature("KSP-P-00001|Cybercrimes", "Cybercrimes", "Online Fraud");
  const b = moSignature("KSP-P-00002|Cybercrimes", "Cybercrimes", "Online Fraud");
  assert.notDeepEqual(CREW_TRAITS.map((t) => a[t]), CREW_TRAITS.map((t) => b[t]));
});

test("an unknown crime type still gets a complete signature", () => {
  const s = moSignature("x|Other IPC Crimes", "Other IPC Crimes", "Something New");
  for (const t of [...CREW_TRAITS, ...OFFENCE_TRAITS]) assert.ok(s[t] && s[t].length > 5, t);
});
