import { NextRequest } from "next/server";
import { requireUser, getScope } from "@/lib/chat-auth";
import { buildCrew } from "@/lib/crew";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The crew dossier around one case or one person. Accepts a CrimeNo as well as
 * an internal id, because a CrimeNo is what an officer actually has in front of
 * them. The walk runs inside the caller's scope, so a district-posted officer
 * gets the part of the network their posting lets them see.
 */
export async function GET(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;

  const q = req.nextUrl.searchParams;
  const personId = q.get("personId");
  const crimeNo = q.get("crimeNo");
  let caseId = Number(q.get("caseId")) || null;

  if (!caseId && !personId && !crimeNo) {
    return Response.json({ error: "Pass caseId, crimeNo or personId" }, { status: 400 });
  }

  try {
    const { districtId } = await getScope(req);

    if (!caseId && crimeNo) {
      const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
        `SELECT "CaseMasterID" AS id FROM "CaseMaster" WHERE "CrimeNo" = $1 LIMIT 1`,
        crimeNo
      );
      if (!rows.length) return Response.json({ error: `No case with CrimeNo ${crimeNo}` }, { status: 404 });
      caseId = rows[0].id;
    }

    const dossier = await buildCrew({ caseId, personId }, { districtId });
    if (!dossier.cases.length) {
      return Response.json({ error: "Nothing to build a dossier from — the seed case or person is not in scope" }, { status: 404 });
    }
    return Response.json({ dossier });
  } catch (e) {
    console.error("crew dossier failed:", e);
    return Response.json({ error: "Failed to build the dossier" }, { status: 500 });
  }
}
