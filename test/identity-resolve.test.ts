import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreIdentity,
  compareNames,
  normaliseName,
  ageConsistency,
  IDENT,
  type IdentitySignals,
} from "../lib/identity-resolve";

// Identity resolution is the one place in this codebase where being wrong means
// attributing a stranger's record to a man in custody, so the scoring has to be
// wrong in the safe direction: it may fail to link two files, it may not link
// two people. Everything below asserts on the pure scorer — no database.

const signals = (over: Partial<IdentitySignals> = {}): IdentitySignals => ({
  nameA: "Ravi Kumar",
  nameB: "Ravi Kumar",
  ageA: 34,
  ageB: 34,
  yearsApart: 0,
  genderA: 1,
  genderB: 1,
  sameDistrict: true,
  ...over,
});

test("an initial matches the name it stands for", () => {
  const n = compareNames("R. Kumar", "Ravi Kumar");
  assert.equal(n.initialMatches, 1);
  assert.equal(n.fullMatches, 1);
  assert.ok(n.score > 0.9, `got ${n.score}`);

  const r = scoreIdentity(signals({ nameA: "R. Kumar", nameB: "Ravi Kumar", yearsApart: 2, ageB: 36 }));
  assert.equal(r.capped, null);
  assert.equal(r.isLikely, true, `got ${r.confidence}`);
});

test("a name that is only a prefix of another is scored as the partial match it is", () => {
  // "Ravi" is not a shortening of "Ravi Kumar", it is one of his two names.
  assert.ok(compareNames("Ravi", "Ravi Kumar").score <= 0.5);
});

test("a person is a year older every year", () => {
  // Two years between the files, three years between the recorded ages: an
  // estimated age that drifted, not a contradiction.
  const drifted = ageConsistency(34, 37, 2);
  assert.equal(drifted?.consistent, true);
  assert.equal(drifted?.basis, "drift");

  // The same three-year gap between two files written the same month is two
  // different people, and the calendar is what says so.
  const same = ageConsistency(34, 37, 0);
  assert.equal(same?.consistent, false);
});

test("an age carried forward unchanged still corroborates, at a discount", () => {
  // Stations copy the last file's age instead of asking again. Treating that as
  // a contradiction would rule out exactly the repeat offenders we are after.
  const carried = ageConsistency(40, 40, 5);
  assert.equal(carried?.consistent, true);
  assert.equal(carried?.basis, "carried");
  assert.ok(carried!.score < 1, `got ${carried!.score}`);
});

test("an inconsistent age gap holds the pair below the bar however well the rest agrees", () => {
  const r = scoreIdentity(signals({ ageA: 34, ageB: 41, yearsApart: 0 }));
  assert.equal(r.capped, "age-inconsistent");
  assert.ok(r.confidence <= IDENT.ageInconsistentCap, `got ${r.confidence}`);
  assert.equal(r.isLikely, false);
});

test("a common first name alone never clusters two people", () => {
  // The failure this whole file exists to prevent. One written name is shared
  // by five different people in this corpus; a single matching given name plus
  // agreeing demographics must not be enough.
  const r = scoreIdentity(signals({ nameA: "Ravi", nameB: "Ravi" }));
  assert.equal(r.capped, "thin-name");
  assert.ok(r.confidence <= IDENT.thinNameCap, `got ${r.confidence}`);
  assert.equal(r.isLikely, false);

  // And the same given name with a different surname is not the same man.
  const other = scoreIdentity(signals({ nameA: "Ravi Kumar", nameB: "Ravi Shetty" }));
  assert.equal(other.isLikely, false, `got ${other.confidence}`);
});

test("honorifics and s/o tails are stripped before anything is compared", () => {
  assert.equal(normaliseName("Sri Ravi Kumar"), "ravi kumar");
  assert.equal(normaliseName("Smt. Meena Kamath"), "meena kamath");
  assert.equal(normaliseName("Ravi Kumar S/o Nanjappa"), "ravi kumar");
  assert.equal(normaliseName("Ravi Kumar D/O Nanjappa Gowda"), "ravi kumar");

  const r = scoreIdentity(signals({ nameA: "Sri Ravi Kumar", nameB: "Ravi Kumar S/o Nanjappa" }));
  assert.equal(r.name.score, 1);
  assert.equal(r.capped, null);
  assert.equal(r.isLikely, true, `got ${r.confidence}`);
});

test("gender disagreement is close to a veto", () => {
  const r = scoreIdentity(signals({ genderA: 1, genderB: 2 }));
  assert.equal(r.capped, "gender-mismatch");
  assert.ok(r.confidence <= IDENT.genderMismatchCap, `got ${r.confidence}`);
});

test("the reasons returned are the signals that actually fired", () => {
  const r = scoreIdentity(signals({ nameA: "Ravi Kumar", nameB: "Ravi Kumar", sameDistrict: false }));
  const fired = r.reasons.map((x) => x.signal);
  assert.deepEqual([...fired].sort(), ["age", "gender", "name"]);
  // Locality scored, but a different district is not evidence of anything and
  // must not be presented to an officer as if it were.
  assert.ok(!fired.includes("locality"));
  // Gender agreement is nearly free in a register that is 85% male, so it is
  // listed last and earns almost nothing.
  assert.equal(r.reasons.at(-1)?.signal, "gender");
  // Name leads, and the reasons are ordered by what they contributed.
  assert.equal(r.reasons[0].signal, "name");
  assert.ok(r.reasons[0].label.includes("Ravi Kumar"));
  assert.ok(r.reasons.every((x, i, a) => i === 0 || a[i - 1].weight >= x.weight));
});

test("no signal at all is no confidence", () => {
  const r = scoreIdentity({
    nameA: null, nameB: null, ageA: null, ageB: null,
    yearsApart: null, genderA: null, genderB: null, sameDistrict: null,
  });
  assert.equal(r.confidence, 0);
  assert.equal(r.isLikely, false);
  assert.deepEqual(r.reasons, []);
});
