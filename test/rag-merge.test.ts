import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeExamples } from "../lib/rag";

// What the system was taught in review has to be able to displace a seeded
// example — that is the whole point — without letting a weak match in on a
// scale it was never comparable on.
const ex = (question: string, score: number) => ({ question, sql: `-- ${question}`, score });

const SEEDED = [ex("seeded a", 0.87), ex("seeded b", 0.86), ex("seeded c", 0.85)];

test("with no learned examples the seeded ranking is untouched", () => {
  assert.deepEqual(mergeExamples(SEEDED, [], true, 3), SEEDED);
});

test("a stronger learned example takes the top slot and the weakest seeded one drops", () => {
  const merged = mergeExamples(SEEDED, [ex("learned", 0.99)], true, 3);
  assert.deepEqual(merged.map((e) => e.question), ["learned", "seeded a", "seeded b"]);
});

test("a weaker learned example still ranks where it belongs", () => {
  const merged = mergeExamples(SEEDED, [ex("learned", 0.855)], true, 3);
  assert.deepEqual(merged.map((e) => e.question), ["seeded a", "seeded b", "learned"]);
});

test("the same question is not shown twice", () => {
  const merged = mergeExamples(SEEDED, [ex("seeded a", 0.99)], true, 3);
  assert.equal(merged.filter((e) => e.question === "seeded a").length, 1);
  assert.equal(merged.length, 3);
});

test("on incomparable scales a clearly relevant learned example gets one slot", () => {
  // Word-overlap scores are not cosine, so only the best one is admitted and
  // the rest of the list stays seeded.
  const merged = mergeExamples(SEEDED, [ex("learned", 0.55), ex("learned two", 0.5)], false, 3);
  assert.deepEqual(merged.map((e) => e.question), ["learned", "seeded a", "seeded b"]);
});

test("on incomparable scales a weak overlap is ignored entirely", () => {
  assert.deepEqual(mergeExamples(SEEDED, [ex("learned", 0.12)], false, 3), SEEDED);
});
