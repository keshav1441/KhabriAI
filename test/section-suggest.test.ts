import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { rankSections, key, type EvidenceCase, type SectionRef } from "../lib/section-suggest";

// The ranking is the part an officer's charge sheet ends up resting on, so what
// it has to get right is not "which section is common" but "which section is
// evidence" — and it has to refuse to answer when the record says nothing.

const sec = (s: string): SectionRef => ({ actCode: s.split(" ")[0], sectionCode: s.split(" ")[1] });

const caseWith = (id: number, score: number, sections: string[]): EvidenceCase => ({
  caseId: id,
  crimeNo: `CR-${id}`,
  score,
  sections: sections.map(sec),
});

const rates = (m: Record<string, number>) => new Map(Object.entries(m).map(([k, v]) => [key(sec(k)), v]));

const codes = (out: { actCode: string; sectionCode: string }[]) => out.map((s) => `${s.actCode} ${s.sectionCode}`);

test("a section most similar cases used outranks a rare one", () => {
  const cases = [
    caseWith(1, 0.9, ["IPC 392"]),
    caseWith(2, 0.88, ["IPC 392"]),
    caseWith(3, 0.86, ["IPC 392"]),
    caseWith(4, 0.84, ["IPC 392", "IPC 397"]),
    caseWith(5, 0.8, ["IPC 397"]),
  ];
  const out = rankSections(cases, { baseRates: rates({ "IPC 392": 0.06, "IPC 397": 0.05 }) });
  assert.equal(codes(out)[0], "IPC 392");
  assert.equal(out[0].usedByCases, 4);
  assert.ok(out[0].confidence > out[1].confidence);
});

test("a section attached to nearly every case in the corpus is discounted", () => {
  // Both appear in every neighbour, so raw counting cannot separate them. IPC 34
  // is on 95% of the corpus — seeing it here tells the officer nothing new.
  const cases = [1, 2, 3, 4].map((i) => caseWith(i, 0.8, ["IPC 34", "IPC 457"]));
  const out = rankSections(cases, { baseRates: rates({ "IPC 34": 0.95, "IPC 457": 0.04 }) });
  assert.equal(codes(out)[0], "IPC 457");
  assert.ok(out[0].confidence > 2 * out[1].confidence, "the ubiquitous section should be heavily discounted");
});

test("closer narratives carry more weight than distant ones", () => {
  const cases = [
    caseWith(1, 0.95, ["IPC 302"]),
    caseWith(2, 0.94, ["IPC 302"]),
    caseWith(3, 0.30, ["IPC 304"]),
    caseWith(4, 0.28, ["IPC 304"]),
  ];
  const out = rankSections(cases, { baseRates: rates({ "IPC 302": 0.1, "IPC 304": 0.1 }) });
  assert.equal(codes(out)[0], "IPC 302");
});

test("identical evidence breaks ties on support, then deterministically on the code", () => {
  const cases = [
    caseWith(1, 0.8, ["IPC 380", "IPC 379"]),
    caseWith(2, 0.8, ["IPC 380", "IPC 379"]),
    caseWith(3, 0.8, ["IPC 454"]),
    caseWith(4, 0.8, ["IPC 454"]),
    caseWith(5, 0.8, ["IPC 454"]),
  ];
  const out = rankSections(cases, { baseRates: rates({ "IPC 379": 0.05, "IPC 380": 0.05, "IPC 454": 0.05 }) });
  // More supporting cases first; the two that are indistinguishable sort by code.
  assert.deepEqual(codes(out), ["IPC 454", "IPC 379", "IPC 380"]);
  // Stable across input order — the officer must not see a different list on a re-run.
  const shuffled = rankSections([...cases].reverse(), { baseRates: rates({ "IPC 379": 0.05, "IPC 380": 0.05, "IPC 454": 0.05 }) });
  assert.deepEqual(codes(shuffled), codes(out));
});

test("no similar cases yields no suggestions rather than a guess", () => {
  assert.deepEqual(rankSections([], { baseRates: rates({ "IPC 302": 0.1 }) }), []);
  // Neighbours retrieved but all at zero similarity is the same nothing.
  const useless = [caseWith(1, 0, ["IPC 302"]), caseWith(2, 0, ["IPC 302"])];
  assert.deepEqual(rankSections(useless, { baseRates: rates({ "IPC 302": 0.1 }) }), []);
});

test("one lone case is not a pattern", () => {
  const cases = [
    caseWith(1, 0.9, ["IPC 420", "IPC 511"]),
    caseWith(2, 0.9, ["IPC 420"]),
    caseWith(3, 0.9, ["IPC 420"]),
  ];
  const out = rankSections(cases, { baseRates: rates({ "IPC 420": 0.07, "IPC 511": 0.01 }) });
  assert.deepEqual(codes(out), ["IPC 420"], "a section seen in exactly one neighbour is that file's quirk");
});

test("what the crime head cannot carry is never suggested", () => {
  const cases = [1, 2, 3].map((i) => caseWith(i, 0.9, ["MV_ACT 279", "IPC 304A"]));
  const out = rankSections(cases, {
    baseRates: rates({ "MV_ACT 279": 0.05, "IPC 304A": 0.05 }),
    allowedActs: new Set(["IPC"]),
  });
  assert.deepEqual(codes(out), ["IPC 304A"]);
});

test("suggestions carry their receipts", () => {
  const cases = [caseWith(11, 0.9, ["IPC 392"]), caseWith(12, 0.9, ["IPC 392"]), caseWith(13, 0.9, ["IPC 392"]), caseWith(14, 0.9, ["IPC 392"])];
  const out = rankSections(cases, {
    baseRates: rates({ "IPC 392": 0.05 }),
    descriptions: new Map([[key(sec("IPC 392")), "Robbery"]]),
  });
  assert.equal(out[0].description, "Robbery");
  assert.deepEqual(out[0].exampleCrimeNos, ["CR-11", "CR-12", "CR-13"], "at most three precedents, and only real CrimeNos");
  assert.ok(out[0].confidence > 0 && out[0].confidence <= 1);
});

test("a duplicated section on one file does not vote twice", () => {
  const twice = [caseWith(1, 0.9, ["IPC 392", "IPC 392"]), caseWith(2, 0.9, ["IPC 392"])];
  const once = [caseWith(1, 0.9, ["IPC 392"]), caseWith(2, 0.9, ["IPC 392"])];
  const b = rates({ "IPC 392": 0.05 });
  assert.equal(rankSections(twice, { baseRates: b })[0].usedByCases, rankSections(once, { baseRates: b })[0].usedByCases);
});
