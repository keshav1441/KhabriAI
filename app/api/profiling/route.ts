import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/chat-auth";

export const dynamic = "force-dynamic";

const num = (rows: Record<string, unknown>[]) =>
  rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v])));

// Socio-demographic + behavioural profiling over accused / victims / complainants.
export async function GET(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;
  try {
    const [accusedAge, accusedGender, victimGender, occupation, religion, caste, offenderProfile] = await Promise.all([
      prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT CASE WHEN "AgeYear" < 26 THEN '18–25' WHEN "AgeYear" < 36 THEN '26–35'
                    WHEN "AgeYear" < 46 THEN '36–45' ELSE '46+' END AS "Age band",
               COUNT(*) AS "Accused"
        FROM "Accused" WHERE "AgeYear" IS NOT NULL GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT CASE "GenderID" WHEN 1 THEN 'Male' WHEN 2 THEN 'Female' ELSE 'Other' END AS "Gender",
               COUNT(*) AS "Accused"
        FROM "Accused" WHERE "GenderID" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`,
      prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT CASE "GenderID" WHEN 1 THEN 'Male' WHEN 2 THEN 'Female' ELSE 'Other' END AS "Gender",
               COUNT(*) AS "Victims"
        FROM "Victim" WHERE "GenderID" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`,
      prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT om."OccupationName" AS "Occupation", COUNT(*) AS "Complainants"
        FROM "ComplainantDetails" cd JOIN "OccupationMaster" om ON om."OccupationID" = cd."OccupationID"
        GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
      prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT rm."ReligionName" AS "Religion", COUNT(*) AS "Complainants"
        FROM "ComplainantDetails" cd JOIN "ReligionMaster" rm ON rm."ReligionID" = cd."ReligionID"
        GROUP BY 1 ORDER BY 2 DESC`,
      prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT cst."caste_master_name" AS "Caste", COUNT(*) AS "Complainants"
        FROM "ComplainantDetails" cd JOIN "CasteMaster" cst ON cst."caste_master_id" = cd."CasteID"
        GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
      // Behavioural profile: for each crime group, the typical offender.
      prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT ch."CrimeGroupName" AS crime_group,
               ROUND(AVG(a."AgeYear")) AS avg_age,
               ROUND(100.0 * COUNT(*) FILTER (WHERE a."GenderID" = 1) / COUNT(*)) AS male_pct,
               ROUND(100.0 * COUNT(*) FILTER (WHERE pc.n >= 2) / COUNT(*)) AS repeat_pct
        FROM "Accused" a
        JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID"
        JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
        LEFT JOIN (SELECT "PersonID", COUNT(DISTINCT "CaseMasterID") n FROM "Accused"
                   WHERE "PersonID" IS NOT NULL GROUP BY 1) pc ON pc."PersonID" = a."PersonID"
        WHERE a."AgeYear" IS NOT NULL
        GROUP BY 1 ORDER BY 1`,
    ]);

    return Response.json({
      accusedAge: num(accusedAge),
      accusedGender: num(accusedGender),
      victimGender: num(victimGender),
      occupation: num(occupation),
      religion: num(religion),
      caste: num(caste),
      offenderProfile: num(offenderProfile),
    });
  } catch (e) {
    console.error("profiling failed:", e);
    return Response.json({ error: "profiling failed" }, { status: 500 });
  }
}
