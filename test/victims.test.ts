import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreVictimPair,
  buildRepeatVictims,
  blockKey,
  nameRarity,
  VIC,
  type VictimPairSignals,
  type VictimRecord,
} from "../lib/victims";

// The victim register carries a name, an age and a gender and nothing else, so
// the whole feature rests on this one judgement: are these two rows the same
// person? It has to be provable on its own, without a database — a protection
// list that clusters the wrong people is worse than no list.

const pair = (over: Partial<VictimPairSignals> = {}): VictimPairSignals => ({
  nameA: "Lakshmi Narayana Bhat",
  nameB: "Lakshmi Narayana Bhat",
  ageA: 34,
  ageB: 36,
  genderA: 2,
  genderB: 2,
  yearGap: 2,
  nameBearers: 1,
  place: "sameStation",
  ...over,
});

test("same name, age moving with the calendar, clusters", () => {
  const s = scoreVictimPair(pair());
  assert.equal(s.blocked, null);
  assert.ok(s.isMatch, `confidence ${s.confidence}`);
  assert.ok(s.confidence >= VIC.threshold);
});

test("same name with an impossible age jump does not cluster", () => {
  // Two years apart, twenty-five years older. Whoever this is, it is not one
  // person — and the block has to hold whatever else agrees.
  const s = scoreVictimPair(pair({ ageB: 61 }));
  assert.equal(s.blocked, "age");
  assert.equal(s.isMatch, false);
  assert.equal(s.confidence, 0);
  assert.deepEqual(s.reasons, []);
});

test("a couple of years of recorded drift is still the same person", () => {
  // Ages in the register are rounded and copied off older files; the tolerance
  // exists so ordinary sloppiness does not split a real repeat victim in two.
  const s = scoreVictimPair(pair({ ageB: 38 }));
  assert.equal(s.blocked, null);
  assert.ok(s.isMatch, `confidence ${s.confidence}`);
});

test("a common first name alone does not clear the bar", () => {
  const s = scoreVictimPair(pair({ nameA: "Ravi", nameB: "Ravi", nameBearers: 240 }));
  assert.equal(s.blocked, null); // it is not refused outright...
  assert.equal(s.capped, "mononym"); // ...it is held down
  assert.ok(s.confidence <= VIC.mononymCap, `confidence ${s.confidence}`);
  assert.equal(s.isMatch, false);
});

test("a common full name clusters but can never read as confident", () => {
  const s = scoreVictimPair(pair({ nameBearers: 31 }));
  assert.ok(s.isMatch);
  assert.equal(s.capped, "common-name");
  assert.equal(s.confidence, VIC.commonNameCap);
});

test("gender disagreement blocks the match", () => {
  const s = scoreVictimPair(pair({ genderA: 1, genderB: 2 }));
  assert.equal(s.blocked, "gender");
  assert.equal(s.isMatch, false);
  assert.equal(s.confidence, 0);
});

test("a missing gender neither blocks nor is credited as agreement", () => {
  const known = scoreVictimPair(pair());
  const unknown = scoreVictimPair(pair({ genderB: null }));
  assert.equal(unknown.blocked, null);
  assert.ok(unknown.confidence < known.confidence);
});

test("two different names are not rescued by everything else agreeing", () => {
  const s = scoreVictimPair(pair({ nameB: "Shivakumar Hegde" }));
  assert.equal(s.blocked, "name");
  assert.equal(s.isMatch, false);
});

test("honorifics and s/o tails are not part of the name", () => {
  const s = scoreVictimPair(pair({ nameA: "Smt. Lakshmi Narayana Bhat", nameB: "lakshmi narayana bhat s/o Ramesh" }));
  assert.equal(s.blocked, null);
  assert.ok(s.isMatch);
  assert.ok(s.reasons.some((r) => r.signal === "name" && r.label.includes("identically")));
});

test("the reasons name exactly the signals that fired", () => {
  const s = scoreVictimPair(pair());
  const fired = s.reasons.map((r) => r.signal).sort();
  assert.deepEqual(fired, ["age", "gender", "name", "place", "rarity"].sort());
  assert.ok(s.reasons.some((r) => r.signal === "age" && /age moves with/i.test(r.label)));
  assert.ok(s.reasons.some((r) => r.signal === "rarity" && /unique/i.test(r.label)));
  // Heaviest contribution first, so the "why" line leads with the real evidence.
  for (let i = 1; i < s.reasons.length; i++) assert.ok(s.reasons[i - 1].weight >= s.reasons[i].weight);
});

test("a weak signal is not listed as a reason", () => {
  // Different districts: the place signal contributes almost nothing and must
  // not appear as though it corroborated anything.
  const s = scoreVictimPair(pair({ place: "otherDistrict" }));
  assert.ok(!s.reasons.some((r) => r.signal === "place"), JSON.stringify(s.reasons));
});

test("rarity falls away as a name is shared", () => {
  assert.equal(nameRarity(1), 1);
  assert.ok(nameRarity(4) < 1 && nameRarity(4) > 0);
  assert.equal(nameRarity(VIC.rarityCeiling + 1), 0);
});

test("the blocking key survives spelling noise but separates real names", () => {
  assert.equal(blockKey("Smt. Lakshmi Bhat"), blockKey("lakshmi bhat"));
  // Order of the parts must not matter — registers swap given and family names.
  assert.equal(blockKey("Bhat Lakshmi"), blockKey("Lakshmi Bhat"));
  assert.notEqual(blockKey("Lakshmi Bhat"), blockKey("Shivakumar Hegde"));
});

// ---- clustering over records ------------------------------------------------

const rec = (over: Partial<VictimRecord> & { victimId: number; caseId: number }): VictimRecord => ({
  crimeNo: `CR/${over.caseId}`,
  name: "Lakshmi Narayana Bhat",
  age: 34,
  genderId: 2,
  date: "2025-01-10",
  districtId: 7,
  district: "Udupi",
  stationId: 71,
  station: "Malpe PS",
  crimeType: "Theft",
  status: "Under Investigation",
  ...over,
});

test("the distribution counts people, not rows", () => {
  const r = buildRepeatVictims([
    rec({ victimId: 1, caseId: 100, date: "2024-02-01", age: 34 }),
    rec({ victimId: 2, caseId: 101, date: "2025-02-01", age: 35 }),
    rec({ victimId: 3, caseId: 102, date: "2025-03-01", name: "Shivakumar Hegde", age: 51 }),
  ]);
  assert.equal(r.distribution.people, 2);
  assert.equal(r.distribution.repeatPeople, 1);
  assert.equal(r.distribution.repeatCases, 2);
  assert.equal(r.distribution.cases, 3);
  assert.equal(r.clusters.length, 1);
  assert.equal(r.clusters[0].caseCount, 2);
  assert.equal(r.clusters[0].spanDays, 366);
});

test("a name shared by two plainly different people stays two people", () => {
  const r = buildRepeatVictims([
    rec({ victimId: 1, caseId: 100, date: "2024-02-01", age: 34 }),
    rec({ victimId: 2, caseId: 101, date: "2025-02-01", age: 71 }),
  ]);
  assert.equal(r.distribution.people, 2);
  assert.equal(r.distribution.repeatPeople, 0);
  assert.deepEqual(r.clusters, []);
});

test("minCases filters the list without changing the finding", () => {
  const records = [
    rec({ victimId: 1, caseId: 100, date: "2024-02-01", age: 34 }),
    rec({ victimId: 2, caseId: 101, date: "2025-02-01", age: 35 }),
  ];
  const r = buildRepeatVictims(records, { minCases: 3 });
  assert.deepEqual(r.clusters, []);
  // The headline ratio is about the register, not about what the list shows.
  assert.equal(r.distribution.repeatPeople, 1);
  assert.equal(r.distribution.repeatCaseShare, 1);
});
