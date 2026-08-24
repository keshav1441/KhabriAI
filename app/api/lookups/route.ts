import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/chat-auth";

export const dynamic = "force-dynamic";

const SECTION_LIMIT = 1000;

// Every reference list the Register-FIR form needs, in one round trip.
export async function GET(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;
  try {
    const [districts, crimeHeads, statuses, categories, gravity, courts, sections] = await Promise.all([
      prisma.district.findMany({
        where: { Active: true }, orderBy: { DistrictName: "asc" },
        select: { DistrictID: true, DistrictName: true, units: { where: { Active: true }, orderBy: { UnitName: "asc" }, select: { UnitID: true, UnitName: true } } },
      }),
      prisma.crimeHead.findMany({
        where: { Active: true }, orderBy: { CrimeGroupName: "asc" },
        select: { CrimeHeadID: true, CrimeGroupName: true, subHeads: { orderBy: { SeqID: "asc" }, select: { CrimeSubHeadID: true, CrimeHeadName: true } }, actSections: { select: { ActCode: true } } },
      }),
      prisma.caseStatusMaster.findMany({ select: { CaseStatusID: true, CaseStatusName: true } }),
      prisma.caseCategory.findMany({ select: { CaseCategoryID: true, LookupValue: true } }),
      prisma.gravityOffence.findMany({ select: { GravityOffenceID: true, LookupValue: true } }),
      prisma.court.findMany({ where: { Active: true }, orderBy: { CourtName: "asc" }, select: { CourtID: true, CourtName: true, DistrictID: true } }),
      // Capped: against a real KSP Section table this list is unbounded, and the
      // Register-FIR form turns every row it receives into a checkbox.
      prisma.section.findMany({ where: { Active: true }, orderBy: [{ ActCode: "asc" }, { SectionCode: "asc" }], select: { ActCode: true, SectionCode: true, SectionDescription: true }, take: SECTION_LIMIT }),
    ]);
    return Response.json(
      { districts, crimeHeads, statuses, categories, gravity, courts, sections },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (e) {
    console.error("lookups error:", e);
    return Response.json({ error: "Failed to load lookups" }, { status: 500 });
  }
}
