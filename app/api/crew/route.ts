import { NextRequest } from "next/server";
import { requireUser, getScope } from "@/lib/chat-auth";
import { buildCrew } from "@/lib/crew";
import { scopedClient } from "@/lib/db";

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
  // A caseId past int4 is a CrimeNo someone sent to the wrong parameter. Reject
  // it here rather than letting Postgres raise "value out of range for type
  // integer" and surface as a 500.
  const rawCaseId = q.get("caseId");
  let caseId = rawCaseId ? Number(rawCaseId) : null;
  if (caseId !== null && (!Number.isSafeInteger(caseId) || caseId <= 0 || caseId > 2147483647)) {
    return Response.json(
      { error: "That looks like a Crime No. rather than a case id — pass it as crimeNo" },
      { status: 400 }
    );
  }

  if (!caseId && !personId && !crimeNo) {
    return Response.json({ error: "Pass caseId, crimeNo or personId" }, { status: 400 });
  }

  try {
    const { districtId } = await getScope(req);

    // One answer for "no such case" and "not yours to see". Two different 404s
    // let an officer enumerate valid CrimeNos statewide by diffing the message.
    const notFound = Response.json(
      { error: "No case to build a dossier from — check the number, or it may be outside your posting" },
      { status: 404 }
    );

    if (!caseId && crimeNo) {
      const rows = await scopedClient(districtId).$queryRawUnsafe<{ id: number }[]>(
        `SELECT "CaseMasterID" AS id FROM "CaseMaster" WHERE "CrimeNo" = $1 LIMIT 1`,
        crimeNo
      );
      if (!rows.length) return notFound;
      caseId = rows[0].id;
    }

    const dossier = await buildCrew({ caseId, personId }, { districtId });
    if (!dossier.cases.length) return notFound;
    return Response.json({ dossier });
  } catch (e) {
    console.error("crew dossier failed:", e);
    return Response.json({ error: "Failed to build the dossier" }, { status: 500 });
  }
}
