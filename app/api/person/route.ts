import { NextRequest } from "next/server";
import { requireUser, scopedDb } from "@/lib/chat-auth";

export const dynamic = "force-dynamic";

// Full dossier for one person (by co-offender PersonID): demographics across
// their cases, and every case they're accused in — not just the ones shared
// with the currently-selected associate.
export async function GET(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;
  const { db } = await scopedDb(req);

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  try {
    const [personRows, caseRows] = await Promise.all([
      db.$queryRaw<
        { name: string | null; age: number | null; gender_id: number | null; cases: bigint }[]
      >`
        SELECT MAX("AccusedName") AS name,
               MAX("AgeYear") AS age,
               MAX("GenderID") AS gender_id,
               COUNT(DISTINCT "CaseMasterID") AS cases
        FROM "Accused"
        WHERE "PersonID" = ${id}
        GROUP BY "PersonID"
      `,
      db.$queryRaw<
        {
          id: number; crime_no: string | null; crime_name: string | null; crime_group: string | null;
          status: string | null; district: string | null; station: string | null;
          date: Date | null; arrested: boolean;
        }[]
      >`
        SELECT cm."CaseMasterID" AS id, cm."CrimeNo" AS crime_no,
               csh."CrimeHeadName" AS crime_name, ch."CrimeGroupName" AS crime_group,
               cs."CaseStatusName" AS status,
               d."DistrictName" AS district, u."UnitName" AS station,
               cm."CrimeRegisteredDate" AS date,
               EXISTS (
                 SELECT 1 FROM "ArrestSurrender" ar
                 WHERE ar."AccusedMasterID" = a."AccusedMasterID" AND ar."IsAccused" = true
               ) AS arrested
        FROM "Accused" a
        JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID"
        LEFT JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
        LEFT JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
        LEFT JOIN "CaseStatusMaster" cs ON cs."CaseStatusID" = cm."CaseStatusID"
        LEFT JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
        LEFT JOIN "District" d ON d."DistrictID" = u."DistrictID"
        WHERE a."PersonID" = ${id}
        ORDER BY cm."CrimeRegisteredDate" DESC NULLS LAST
      `,
    ]);

    if (!personRows.length) return Response.json({ error: "Person not found" }, { status: 404 });
    const p = personRows[0];
    const gender = p.gender_id === 1 ? "Male" : p.gender_id === 2 ? "Female" : p.gender_id ? "Transgender" : null;

    return Response.json({
      id,
      name: p.name ?? id,
      age: p.age,
      gender,
      caseCount: Number(p.cases),
      crimeGroups: Array.from(new Set(caseRows.map((c) => c.crime_group).filter(Boolean))),
      cases: caseRows.map((c) => ({
        id: c.id,
        crimeNo: c.crime_no ?? String(c.id),
        crimeName: c.crime_name ?? "Unknown",
        crimeGroup: c.crime_group ?? "Unknown",
        status: c.status ?? "Unknown",
        district: c.district,
        station: c.station,
        date: c.date,
        arrested: c.arrested,
      })),
    });
  } catch (e) {
    console.error("person detail failed:", e);
    return Response.json({ error: "Failed to fetch person" }, { status: 500 });
  }
}
