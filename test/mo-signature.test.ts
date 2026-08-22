import { test } from "node:test";
import assert from "node:assert/strict";
import { moSignature } from "../lib/mo-signature";

test("the same series key always yields the same MO traits", () => {
  assert.deepEqual(moSignature("KSP-P-00238|Crimes Against Property", "Crimes Against Property"), moSignature("KSP-P-00238|Crimes Against Property", "Crimes Against Property"));
});

test("different series get different signatures and every trait is filled", () => {
  const a = moSignature("KSP-P-00001|Cybercrimes", "Cybercrimes");
  const b = moSignature("KSP-P-00002|Cybercrimes", "Cybercrimes");
  assert.notDeepEqual(a, b);
  for (const v of Object.values(a)) assert.ok(v.length > 5);
  assert.ok("lure" in a && "route" in a);
});

test("an unknown crime group falls back to the generic trait set", () => {
  assert.ok("group" in moSignature("x|Unknown", "Unknown"));
});
