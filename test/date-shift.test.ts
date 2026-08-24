import { test } from "node:test";
import assert from "node:assert/strict";
import { shiftDatesInText } from "../lib/date-shift";

test("dd-mm-yyyy and dd/mm/yyyy shift and keep their format", () => {
  assert.equal(shiftDatesInText("On 17-04-2025 at Mandya", 31), "On 18-05-2025 at Mandya");
  assert.equal(shiftDatesInText("on 14-3-2026 a shop", 31), "on 14-4-2026 a shop");
  assert.equal(shiftDatesInText("filed 05/03/2026.", 31), "filed 05/04/2026.");
});

test("d Mon yyyy and d Month yyyy shift and keep their format", () => {
  assert.equal(shiftDatesInText("on 10 Sep 2025 at Kolar", 31), "on 11 Oct 2025 at Kolar");
  assert.equal(shiftDatesInText("on 27 October 2025 in Chikkamagaluru", 31), "on 27 November 2025 in Chikkamagaluru");
  assert.equal(shiftDatesInText("On 1 Feb 2026 between 02:30 and 04:00 hrs", 31), "On 4 Mar 2026 between 02:30 and 04:00 hrs");
});

test("ISO dates shift; year rolls over", () => {
  assert.equal(shiftDatesInText("registered 2025-12-20", 31), "registered 2026-01-20");
});

test("times, amounts and phone-like numbers are left alone", () => {
  const s = "at 16:55 hrs, ₹4.3 lakh, called 98450-12345, 12 lakh";
  assert.equal(shiftDatesInText(s, 31), s);
});

test("a zero shift is the identity", () => {
  assert.equal(shiftDatesInText("on 17-04-2025 and 10 Sep 2025", 0), "on 17-04-2025 and 10 Sep 2025");
});
