import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appearsInDocument, buildDraft, EXTRACT_FIELDS, parseAge, parseDocDate, parseGender,
  parseSectionRef, resolveVocab, type ExtractLookups, type RawExtraction,
} from "../lib/fir-extract";

const lookups: ExtractLookups = {
  districts: [
    { DistrictID: 1, DistrictName: "Bengaluru Urban", units: [{ UnitID: 11, UnitName: "Bengaluru Urban PS 1" }, { UnitID: 12, UnitName: "Bengaluru Urban PS 2" }] },
    { DistrictID: 2, DistrictName: "Mysuru", units: [{ UnitID: 21, UnitName: "Mysuru PS 1" }, { UnitID: 22, UnitName: "Central PS" }] },
    { DistrictID: 3, DistrictName: "Belagavi", units: [{ UnitID: 31, UnitName: "Central PS" }] },
  ],
  crimeHeads: [
    { CrimeHeadID: 5, CrimeGroupName: "Property Crimes", subHeads: [{ CrimeSubHeadID: 51, CrimeHeadName: "Theft" }, { CrimeSubHeadID: 52, CrimeHeadName: "Robbery" }] },
    { CrimeHeadID: 6, CrimeGroupName: "Cybercrimes", subHeads: [{ CrimeSubHeadID: 61, CrimeHeadName: "Online Fraud" }] },
  ],
  categories: [{ CaseCategoryID: 1, LookupValue: "Cognizable" }, { CaseCategoryID: 2, LookupValue: "Non-Cognizable" }],
  gravity: [{ GravityOffenceID: 2, LookupValue: "Heinous" }, { GravityOffenceID: 3, LookupValue: "Non-Heinous" }],
  courts: [{ CourtID: 8, CourtName: "Bengaluru Urban District Court", DistrictID: 1 }, { CourtID: 9, CourtName: "Mysuru District Court", DistrictID: 2 }],
  sections: [
    { ActCode: "IPC", SectionCode: "379" }, { ActCode: "IPC", SectionCode: "304A" },
    { ActCode: "MV_ACT", SectionCode: "304A" }, { ActCode: "IT_ACT", SectionCode: "66C" },
  ],
};

const DOC = `KARNATAKA STATE POLICE - FIRST INFORMATION REPORT
District: Bangalore
Police Station: Bengaluru Urban PS 1
Date of registration: 20/08/2026
Date of occurrence: 19/08/2026
Crime group: Property Crimes
Offence: Theft
Sections: IPC 379
Complainant: Ramesh Gowda, aged 41 years, male
Accused: Suresh Naik, 29, male
Brief facts: A two-wheeler was stolen from outside the complainant's residence overnight.`;

const fullRaw = (): RawExtraction => ({
  district: "Bangalore",
  policeStation: "Bengaluru Urban PS 1",
  crimeGroup: "Property Crimes",
  crime: "Theft",
  registeredDate: "20/08/2026",
  incidentDate: "19/08/2026",
  briefFacts: "A two-wheeler was stolen from outside the complainant's residence overnight.",
  complainant: { name: "Ramesh Gowda", age: "41 years", gender: "male" },
  accused: [{ name: "Suresh Naik", age: "29", gender: "male" }],
  victims: [],
  sections: ["IPC 379"],
});

/* ── Text presence ───────────────────────────────────────────────── */

test("appearsInDocument ignores case and punctuation but not invention", () => {
  assert.equal(appearsInDocument("bengaluru urban ps 1", DOC), true);
  assert.equal(appearsInDocument("Police Station: Bengaluru Urban PS 1", DOC), true);
  assert.equal(appearsInDocument("Mysuru PS 1", DOC), false);
  assert.equal(appearsInDocument("", DOC), false);
  assert.equal(appearsInDocument(null, DOC), false);
});

/* ── Vocabulary resolution ───────────────────────────────────────── */

test("a matched district resolves to its canonical name, junk resolves to nothing", () => {
  const names = lookups.districts.map((d) => d.DistrictName);
  assert.equal(resolveVocab("Bengaluru Urban", names, "DistrictName"), "Bengaluru Urban");
  assert.equal(resolveVocab("Bangalore", names, "DistrictName"), "Bengaluru Urban"); // officer's older name
  assert.equal(resolveVocab("Belgavi", names, "DistrictName"), "Belagavi");
  assert.equal(resolveVocab("Zzzqx Nagar", names, "DistrictName"), null);
  assert.equal(resolveVocab("", names, "DistrictName"), null);
});

test("lookups outside the fuzzy vocabulary resolve too, and still refuse junk", () => {
  const names = lookups.categories.map((c) => c.LookupValue);
  assert.equal(resolveVocab("cognizable", names), "Cognizable");
  assert.equal(resolveVocab("Qwertyuiop", names), null);
});

/* ── Section strings ─────────────────────────────────────────────── */

test("section references resolve only to real Act/Section pairs", () => {
  assert.equal(parseSectionRef("IPC 379", lookups.sections), "IPC|379");
  assert.equal(parseSectionRef("u/s 379 of the Indian Penal Code, 1860", lookups.sections), "IPC|379");
  assert.equal(parseSectionRef("Section 66C of the IT Act, 2000", lookups.sections), "IT_ACT|66C");
  assert.equal(parseSectionRef("IPC 500", lookups.sections), null); // not seeded
  assert.equal(parseSectionRef("304A", lookups.sections), null); // in two acts, no act named
  assert.equal(parseSectionRef("MV Act 304A", lookups.sections), "MV_ACT|304A");
  assert.equal(parseSectionRef("as applicable", lookups.sections), null);
});

/* ── Scalars ─────────────────────────────────────────────────────── */

test("document dates parse day-first and refuse anything ambiguous", () => {
  assert.equal(parseDocDate("20/08/2026"), "2026-08-20");
  assert.equal(parseDocDate("20-08-2026"), "2026-08-20");
  assert.equal(parseDocDate("2026-08-20"), "2026-08-20");
  assert.equal(parseDocDate("20th August 2026"), "2026-08-20");
  assert.equal(parseDocDate("August 20, 2026"), "2026-08-20");
  assert.equal(parseDocDate("31/02/2026"), null);
  assert.equal(parseDocDate("20/08/26"), null); // two-digit year: could be 1926
  assert.equal(parseDocDate("sometime last week"), null);
});

test("gender and age come back blank when the document does not say", () => {
  assert.equal(parseGender("Male"), "1");
  assert.equal(parseGender("F"), "2");
  assert.equal(parseGender("transgender"), "3");
  assert.equal(parseGender("adult"), "");
  assert.equal(parseAge("41 years"), "41");
  assert.equal(parseAge("about 200"), "");
  assert.equal(parseAge(null), "");
});

/* ── Draft assembly ──────────────────────────────────────────────── */

test("a complete document fills the form with real ids", () => {
  const { form, extracted, missing, warnings } = buildDraft(fullRaw(), lookups, DOC);
  assert.equal(form.districtId, "1");
  assert.equal(form.policeStationId, "11");
  assert.equal(form.crimeMajorHeadId, "5");
  assert.equal(form.crimeMinorHeadId, "51");
  assert.equal(form.crimeRegisteredDate, "2026-08-20");
  assert.equal(form.incidentFromDate, "2026-08-19");
  assert.deepEqual(form.sections, ["IPC|379"]);
  assert.deepEqual(form.complainant, { name: "Ramesh Gowda", ageYear: "41", genderId: "1" });
  assert.deepEqual(form.accused, [{ name: "Suresh Naik", ageYear: "29", genderId: "1" }]);
  assert.deepEqual(warnings, []);
  assert.ok(extracted.includes("districtId") && extracted.includes("briefFacts"));
  // Nothing the document is silent about was invented.
  assert.deepEqual(missing.sort(), ["caseCategoryId", "courtId", "gravityOffenceId", "latitude", "longitude", "victims"]);
  assert.equal(extracted.length + missing.length, EXTRACT_FIELDS.length);
});

test("fields the document does not contain stay absent", () => {
  const { form, missing } = buildDraft({ district: "Bangalore" }, lookups, DOC);
  assert.deepEqual(Object.keys(form), ["districtId"]);
  assert.equal(form.policeStationId, undefined);
  assert.equal(form.crimeRegisteredDate, undefined); // never defaulted to today
  assert.ok(missing.includes("policeStationId") && missing.includes("briefFacts"));
});

test("a station that is not in the document is dropped, not filed against", () => {
  const raw = { ...fullRaw(), policeStation: "Mysuru PS 1" };
  const { form, warnings } = buildDraft(raw, lookups, DOC);
  assert.equal(form.policeStationId, undefined);
  assert.equal(form.districtId, "1"); // the district the document *does* name survives
  assert.ok(warnings.some((w) => w.includes("Mysuru PS 1")));
});

test("a value in the document that matches no lookup row is left blank with a warning", () => {
  const doc = "District: Zzzqx Nagar\nPolice Station: Zzzqx Nagar PS";
  const { form, warnings } = buildDraft({ district: "Zzzqx Nagar", policeStation: "Zzzqx Nagar PS" }, lookups, doc);
  assert.equal(form.districtId, undefined);
  assert.equal(form.policeStationId, undefined);
  assert.equal(warnings.length, 2);
});

test("a station name shared by two districts is too ambiguous to fill", () => {
  const doc = "Police Station: Central PS";
  const { form, warnings } = buildDraft({ policeStation: "Central PS" }, lookups, doc);
  assert.equal(form.policeStationId, undefined);
  assert.ok(warnings.some((w) => w.includes("more than one district")));
});

test("naming only the station infers the district it belongs to", () => {
  const doc = "Police Station: Mysuru PS 1";
  const { form } = buildDraft({ policeStation: "Mysuru PS 1" }, lookups, doc);
  assert.equal(form.policeStationId, "21");
  assert.equal(form.districtId, "2");
});

test("invented people are dropped row by row", () => {
  const raw = { ...fullRaw(), accused: [{ name: "Suresh Naik" }, { name: "Ravi Kumar" }] };
  const { form } = buildDraft(raw, lookups, DOC);
  assert.deepEqual(form.accused, [{ name: "Suresh Naik", ageYear: "", genderId: "" }]);
});

test("sections that are not in the Act/Section list are left out", () => {
  const raw = { ...fullRaw(), sections: ["IPC 379", "IPC 379", "IPC 511", "304A"] };
  const { form, warnings } = buildDraft(raw, lookups, DOC);
  assert.deepEqual(form.sections, ["IPC|379"]);
  assert.equal(warnings.length, 2);
});

test("a court outside the resolved district is not selected", () => {
  const doc = `${DOC}\nCourt: Mysuru District Court`;
  const { form, warnings } = buildDraft({ ...fullRaw(), court: "Mysuru District Court" }, lookups, doc);
  assert.equal(form.courtId, undefined);
  assert.ok(warnings.some((w) => w.includes("Mysuru District Court")));
});

test("brief facts shorter than the form allows are not prefilled", () => {
  const { form, missing } = buildDraft({ briefFacts: "Theft." }, lookups, DOC);
  assert.equal(form.briefFacts, undefined);
  assert.ok(missing.includes("briefFacts"));
});

test("condensed brief facts are kept but flagged for reading", () => {
  const raw = { briefFacts: "The complainant's motorcycle was taken during the night from his gate." };
  const { form, warnings } = buildDraft(raw, lookups, DOC);
  assert.equal(form.briefFacts, raw.briefFacts);
  assert.ok(warnings.some((w) => w.includes("condensed")));
});
