import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFirInput, buildCaseNumbers } from "../lib/fir";

const NOW = new Date("2026-08-22T12:00:00Z");

const valid = () => ({
  policeStationId: 50,
  crimeMajorHeadId: 2,
  crimeMinorHeadId: 7,
  crimeRegisteredDate: "2026-08-20",
  incidentFromDate: "2026-08-19",
  caseCategoryId: 1,
  gravityOffenceId: 2,
  courtId: 8,
  latitude: 12.97,
  longitude: 77.59,
  briefFacts: "Two-wheeler stolen from outside the complainant's residence overnight.",
  complainant: { name: "Ramesh Gowda", ageYear: 41, genderId: 1 },
  accused: [{ name: "Unknown person", genderId: 1 }],
  victims: [{ name: "Ramesh Gowda", ageYear: 41, genderId: 1 }],
  sections: [{ actCode: "IPC", sectionCode: "379" }],
});

test("accepts a valid payload and normalises it", () => {
  const r = validateFirInput(valid(), NOW);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.policeStationId, 50);
  assert.equal(r.value.crimeRegisteredDate.toISOString().slice(0, 10), "2026-08-20");
  assert.equal(r.value.accused.length, 1);
  assert.deepEqual(r.value.sections, [{ actCode: "IPC", sectionCode: "379" }]);
});

test("rejects a registration date in the future", () => {
  const r = validateFirInput({ ...valid(), crimeRegisteredDate: "2026-08-23" }, NOW);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.errors.join(" "), /future/i);
});

test("rejects an accused row with an empty name", () => {
  const r = validateFirInput({ ...valid(), accused: [{ name: "   " }] }, NOW);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.errors.join(" "), /accused/i);
});

test("rejects briefFacts shorter than 20 characters", () => {
  const r = validateFirInput({ ...valid(), briefFacts: "Bike stolen." }, NOW);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.errors.join(" "), /briefFacts/);
});

test("rejects more than 10 accused and out-of-range coordinates", () => {
  const many = Array.from({ length: 11 }, (_, i) => ({ name: `A${i}` }));
  assert.equal(validateFirInput({ ...valid(), accused: many }, NOW).ok, false);
  assert.equal(validateFirInput({ ...valid(), latitude: 95 }, NOW).ok, false);
  assert.equal(validateFirInput({ ...valid(), longitude: -200 }, NOW).ok, false);
});

test("rejects non-object bodies and missing required ids", () => {
  assert.equal(validateFirInput(null, NOW).ok, false);
  assert.equal(validateFirInput({ ...valid(), policeStationId: "x" }, NOW).ok, false);
  assert.equal(validateFirInput({ ...valid(), complainant: { name: "" } }, NOW).ok, false);
});

test("CrimeNo / CaseNo follow the seed convention (1 + district pad4 + unit pad4 + year + serial pad5)", () => {
  const n = buildCaseNumbers({ districtId: 8, unitId: 50, year: 2025, serial: 20000 });
  assert.equal(n.crimeNo, "100080050202520000");
  assert.equal(n.caseNo, "202520000");
  const m = buildCaseNumbers({ districtId: 24, unitId: 166, year: 2024, serial: 7 });
  assert.equal(m.crimeNo, "100240166202400007");
  assert.equal(m.caseNo, "202400007");
});

// ── DB-backed round trip (same pattern as db-guards.test.ts) ──────────────────
// Inserts one real case through createCase, checks the row, then deletes it.
import "dotenv/config";
import { after } from "node:test";
import { prisma } from "../lib/db";
import { createCase, FirError } from "../lib/fir-create";

after(() => prisma.$disconnect());

test("createCase inserts CaseMaster + dependents in one transaction, then cleans up", async () => {
  const unit = await prisma.unit.findFirst({ where: { DistrictID: { not: null } }, select: { UnitID: true, DistrictID: true } });
  const sub = await prisma.crimeSubHead.findFirst({ select: { CrimeSubHeadID: true, CrimeHeadID: true } });
  const section = await prisma.section.findFirst({ select: { ActCode: true, SectionCode: true } });
  assert.ok(unit && sub && section, "seeded lookups present");

  const v = validateFirInput({
    ...valid(),
    policeStationId: unit!.UnitID,
    crimeMajorHeadId: sub!.CrimeHeadID,
    crimeMinorHeadId: sub!.CrimeSubHeadID,
    courtId: null,
    sections: [{ actCode: section!.ActCode, sectionCode: section!.SectionCode }],
    briefFacts: "fir.test.ts integration row — safe to delete if it survives a crashed run.",
  }, NOW);
  assert.equal(v.ok, true);
  if (!v.ok) return;

  const { caseMasterId, crimeNo } = await createCase(v.value);
  try {
    const row = await prisma.caseMaster.findUnique({
      where: { CaseMasterID: caseMasterId },
      include: { complainants: true, accused: true, victims: true, actSections: true, caseStatus: true },
    });
    assert.ok(row);
    assert.equal(row!.CrimeNo, crimeNo);
    assert.match(crimeNo, new RegExp(`^1${String(unit!.DistrictID).padStart(4, "0")}${String(unit!.UnitID).padStart(4, "0")}2026\\d{5}$`));
    assert.equal(row!.CaseNo, crimeNo.slice(9));
    assert.equal(row!.caseStatus?.CaseStatusName, "Under Investigation");
    assert.equal(row!.complainants.length, 1);
    assert.equal(row!.accused.length, 1);
    assert.equal(row!.victims.length, 1);
    assert.equal(row!.actSections.length, 1);

    // wrong head/sub-head pairing is rejected before anything is written
    await assert.rejects(createCase({ ...v.value, crimeMajorHeadId: sub!.CrimeHeadID + 1 }), FirError);
  } finally {
    await prisma.$transaction([
      prisma.actSectionAssociation.deleteMany({ where: { CaseMasterID: caseMasterId } }),
      prisma.victim.deleteMany({ where: { CaseMasterID: caseMasterId } }),
      prisma.accused.deleteMany({ where: { CaseMasterID: caseMasterId } }),
      prisma.complainantDetails.deleteMany({ where: { CaseMasterID: caseMasterId } }),
      prisma.caseMaster.delete({ where: { CaseMasterID: caseMasterId } }),
    ]);
  }
  assert.equal(await prisma.caseMaster.findUnique({ where: { CaseMasterID: caseMasterId } }), null);
});
