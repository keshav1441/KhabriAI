import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSignature } from "../lib/crew";

// The signature is what the dossier claims a crew is recognisable by, so it has
// to come out of the narratives themselves — recurring detail, not one file's
// wording and not filler that recurs in every FIR ever written.
const CREW = "two men on a black Pulsar without a number plate";
const HABIT = "cut the CCTV cable before entering";

const narrative = (extra: string) =>
  `A complaint was filed at the station. ${CREW} were seen in the lane. They ${HABIT}. ${extra}`;

test("surfaces a detail repeated across several narratives", () => {
  const sig = extractSignature([
    narrative("Gold ornaments were taken."),
    narrative("Cash was left untouched."),
    narrative("The rear window was forced."),
    narrative("A neighbour heard the dog."),
  ]);
  assert.ok(sig.some((p) => p.includes("black pulsar without a number plate")), `got ${JSON.stringify(sig)}`);
  assert.ok(sig.some((p) => p.includes("cut the cctv cable")), `got ${JSON.stringify(sig)}`);
});

test("keeps the fullest wording, not its fragments", () => {
  const sig = extractSignature([narrative("One."), narrative("Two."), narrative("Three.")]);
  const pulsar = sig.filter((p) => p.includes("pulsar"));
  assert.equal(pulsar.length, 1, `fragments survived: ${JSON.stringify(sig)}`);
  assert.ok(pulsar[0].split(" ").length >= 6);
});

test("does not run a phrase across a sentence boundary", () => {
  const sig = extractSignature([narrative("One."), narrative("Two."), narrative("Three.")]);
  // "number plate" ends one sentence and "they cut" starts the next; a phrase
  // spanning both would be an artefact of adjacency.
  assert.ok(!sig.some((p) => p.includes("number plate they")), `got ${JSON.stringify(sig)}`);
});

test("a detail in only one file is not a signature", () => {
  const sig = extractSignature([
    narrative("The accused wore a red helmet with a cracked visor throughout."),
    narrative("Nothing else was noted."),
    narrative("Nothing else was noted."),
  ]);
  assert.ok(!sig.some((p) => p.includes("cracked visor")), `got ${JSON.stringify(sig)}`);
});

test("needs at least two narratives to say anything", () => {
  assert.deepEqual(extractSignature([narrative("Only one.")]), []);
  assert.deepEqual(extractSignature([]), []);
});
