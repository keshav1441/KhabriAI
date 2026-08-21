import { prisma } from "@/lib/db";
import { buildCaseNumbers, type FirInput } from "@/lib/fir";

export class FirError extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}

/** Inserts CaseMaster + complainant + accused + victims + sections in one transaction. */
export async function createCase(input: FirInput): Promise<{ caseMasterId: number; crimeNo: string }> {
  return prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findUnique({ where: { UnitID: input.policeStationId }, select: { UnitID: true, DistrictID: true } });
    if (!unit || !unit.DistrictID) throw new FirError("policeStationId does not exist");

    const sub = await tx.crimeSubHead.findUnique({ where: { CrimeSubHeadID: input.crimeMinorHeadId }, select: { CrimeHeadID: true } });
    if (!sub) throw new FirError("crimeMinorHeadId does not exist");
    if (sub.CrimeHeadID !== input.crimeMajorHeadId) throw new FirError("crimeMinorHeadId does not belong to crimeMajorHeadId");

    if (input.caseCategoryId && !(await tx.caseCategory.findUnique({ where: { CaseCategoryID: input.caseCategoryId } })))
      throw new FirError("caseCategoryId does not exist");
    if (input.gravityOffenceId && !(await tx.gravityOffence.findUnique({ where: { GravityOffenceID: input.gravityOffenceId } })))
      throw new FirError("gravityOffenceId does not exist");
    if (input.courtId && !(await tx.court.findUnique({ where: { CourtID: input.courtId } })))
      throw new FirError("courtId does not exist");
    if (input.sections.length) {
      const found = await tx.section.count({ where: { OR: input.sections.map((s) => ({ ActCode: s.actCode, SectionCode: s.sectionCode })) } });
      if (found !== input.sections.length) throw new FirError("one or more sections do not exist");
    }

    const status = await tx.caseStatusMaster.findFirst({ where: { CaseStatusName: "Under Investigation" }, select: { CaseStatusID: true } });
    const officer = await tx.employee.findFirst({ where: { UnitID: unit.UnitID }, select: { EmployeeID: true } });

    // ponytail: serial = max serial seen for the year + 1, read inside the txn. No unique
    // constraint on CrimeNo, so two concurrent registrations could collide; acceptable for a prototype.
    const year = input.crimeRegisteredDate.getUTCFullYear();
    const like = `${year}%`;
    const [{ max }] = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(SUBSTRING("CaseNo" FROM 5)::int)::int AS max FROM "CaseMaster" WHERE "CaseNo" LIKE ${like}`;
    const { crimeNo, caseNo } = buildCaseNumbers({ districtId: unit.DistrictID, unitId: unit.UnitID, year, serial: (max ?? 0) + 1 });

    const cm = await tx.caseMaster.create({
      data: {
        CrimeNo: crimeNo,
        CaseNo: caseNo,
        CrimeRegisteredDate: input.crimeRegisteredDate,
        PolicePersonID: officer?.EmployeeID ?? null,
        PoliceStationID: unit.UnitID,
        CaseCategoryID: input.caseCategoryId,
        GravityOffenceID: input.gravityOffenceId,
        CrimeMajorHeadID: input.crimeMajorHeadId,
        CrimeMinorHeadID: input.crimeMinorHeadId,
        CaseStatusID: status?.CaseStatusID ?? null,
        CourtID: input.courtId,
        IncidentFromDate: input.incidentFromDate ?? input.crimeRegisteredDate,
        IncidentToDate: input.crimeRegisteredDate,
        InfoReceivedPSDate: input.crimeRegisteredDate,
        latitude: input.latitude,
        longitude: input.longitude,
        BriefFacts: input.briefFacts,
        complainants: { create: { ComplainantName: input.complainant.name, AgeYear: input.complainant.ageYear ?? null, GenderID: input.complainant.genderId ?? null } },
        accused: { create: input.accused.map((a) => ({ AccusedName: a.name, AgeYear: a.ageYear ?? null, GenderID: a.genderId ?? null, PersonID: a.personId ?? null })) },
        victims: { create: input.victims.map((v) => ({ VictimName: v.name, AgeYear: v.ageYear ?? null, GenderID: v.genderId ?? null })) },
        actSections: { create: input.sections.map((s, i) => ({ ActCode: s.actCode, SectionCode: s.sectionCode, ActOrderID: i + 1, SectionOrderID: i + 1 })) },
      },
      select: { CaseMasterID: true },
    });
    return { caseMasterId: cm.CaseMasterID, crimeNo };
  });
}
