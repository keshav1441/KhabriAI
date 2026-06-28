import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || isNaN(Number(id))) {
    return Response.json({ error: "Invalid case ID" }, { status: 400 });
  }

  try {
    const caseId = Number(id);

    const [caseRow, victims, accused, arrests, chargesheet, actSections] =
      await Promise.all([
        prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT
            cm."CaseMasterID",
            cm."CrimeNo"              AS crime_no,
            cm."CaseNo"               AS case_no,
            cm."CrimeRegisteredDate"  AS crimeregistereddate,
            cm."BriefFacts"           AS brieffacts,
            cm."latitude", cm."longitude",
            u."UnitName" AS station,
            d."DistrictName" AS district,
            ch."CrimeGroupName" AS crime_group,
            csh."CrimeHeadName" AS crime_name,
            cs."CaseStatusName" AS status,
            cat."LookupValue" AS case_category,
            go."LookupValue" AS gravity,
            e."FirstName" AS officer_name,
            ct."CourtName" AS court
          FROM "CaseMaster" cm
          LEFT JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
          LEFT JOIN "District" d ON d."DistrictID" = u."DistrictID"
          LEFT JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
          LEFT JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
          LEFT JOIN "CaseStatusMaster" cs ON cs."CaseStatusID" = cm."CaseStatusID"
          LEFT JOIN "CaseCategory" cat ON cat."CaseCategoryID" = cm."CaseCategoryID"
          LEFT JOIN "GravityOffence" go ON go."GravityOffenceID" = cm."GravityOffenceID"
          LEFT JOIN "Employee" e ON e."EmployeeID" = cm."PolicePersonID"
          LEFT JOIN "Court" ct ON ct."CourtID" = cm."CourtID"
          WHERE cm."CaseMasterID" = ${caseId}
          LIMIT 1`,

        prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT "VictimName", "AgeYear",
            CASE "GenderID" WHEN 1 THEN 'Male' WHEN 2 THEN 'Female' ELSE 'Transgender' END AS gender
          FROM "Victim" WHERE "CaseMasterID" = ${caseId}`,

        prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT "AccusedName", "AgeYear",
            CASE "GenderID" WHEN 1 THEN 'Male' WHEN 2 THEN 'Female' ELSE 'Transgender' END AS gender
          FROM "Accused" WHERE "CaseMasterID" = ${caseId}`,

        prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT ar."ArrestSurrenderDate", a."AccusedName",
            d."DistrictName" AS arrest_district
          FROM "ArrestSurrender" ar
          LEFT JOIN "Accused" a ON a."AccusedMasterID" = ar."AccusedMasterID"
          LEFT JOIN "District" d ON d."DistrictID" = ar."ArrestSurrenderDistrictId"
          WHERE ar."CaseMasterID" = ${caseId}`,

        prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT cd."csdate", cd."cstype", e."FirstName" AS filed_by
          FROM "ChargesheetDetails" cd
          LEFT JOIN "Employee" e ON e."EmployeeID" = cd."PolicePersonID"
          WHERE cd."CaseMasterID" = ${caseId}`,

        prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT asa."ActCode", asa."SectionCode", s."SectionDescription"
          FROM "ActSectionAssociation" asa
          LEFT JOIN "Section" s ON s."ActCode" = asa."ActCode" AND s."SectionCode" = asa."SectionCode"
          WHERE asa."CaseMasterID" = ${caseId}`,
      ]);

    if (!caseRow.length) {
      return Response.json({ error: "Case not found" }, { status: 404 });
    }

    return Response.json({
      case: caseRow[0],
      victims,
      accused,
      arrests,
      chargesheet,
      actSections,
    });
  } catch (e) {
    console.error("Case detail error:", e);
    return Response.json({ error: "Failed to fetch case" }, { status: 500 });
  }
}
