import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/chat-auth";

export const dynamic = "force-dynamic";

// Co-offender network: persons linked by shared cases. Edges are pairs who
// appear together in ≥2 cases (recurring crews, not one-off pairings); nodes
// are the persons in those edges, sized by case count and coloured by their
// dominant crime group.
export async function GET(req: NextRequest) {
  const denied = await requireUser(req);
  if (denied) return denied;
  try {
    const edgeRows = await prisma.$queryRaw<
      { source: string; target: string; weight: bigint }[]
    >`
      WITH strong AS (
        SELECT a1."PersonID" AS p1, a2."PersonID" AS p2,
               COUNT(DISTINCT a1."CaseMasterID") AS w
        FROM "Accused" a1
        JOIN "Accused" a2
          ON a2."CaseMasterID" = a1."CaseMasterID"
         AND a1."PersonID" < a2."PersonID"
        WHERE a1."PersonID" IS NOT NULL AND a2."PersonID" IS NOT NULL
        GROUP BY a1."PersonID", a2."PersonID"
        HAVING COUNT(DISTINCT a1."CaseMasterID") >= 2   -- recurring co-offence
      ),
      deg AS (
        SELECT pid, COUNT(*) AS d
        FROM (SELECT p1 AS pid FROM strong UNION ALL SELECT p2 FROM strong) u
        GROUP BY pid
      ),
      -- keep only persons in 2+ strong links → gang members, not lone pairs
      clustered AS (SELECT pid FROM deg WHERE d >= 2 ORDER BY d DESC LIMIT 90)
      SELECT s.p1 AS source, s.p2 AS target, s.w AS weight
      FROM strong s
      WHERE s.p1 IN (SELECT pid FROM clustered)
        AND s.p2 IN (SELECT pid FROM clustered)
      ORDER BY s.w DESC
    `;

    const ids = Array.from(new Set(edgeRows.flatMap((e) => [e.source, e.target])));
    if (!ids.length) return Response.json({ nodes: [], edges: [] });

    const nodeRows = await prisma.$queryRaw<
      { pid: string; name: string; cases: bigint; crime_group: string | null }[]
    >`
      SELECT a."PersonID" AS pid,
             MAX(a."AccusedName") AS name,
             COUNT(DISTINCT a."CaseMasterID") AS cases,
             (SELECT ch."CrimeGroupName"
                FROM "Accused" aa
                JOIN "CaseMaster" cm ON cm."CaseMasterID" = aa."CaseMasterID"
                JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
               WHERE aa."PersonID" = a."PersonID"
               GROUP BY ch."CrimeGroupName"
               ORDER BY COUNT(*) DESC
               LIMIT 1) AS crime_group
      FROM "Accused" a
      WHERE a."PersonID" = ANY(${ids})
      GROUP BY a."PersonID"
    `;

    // degree = number of distinct co-offenders within the shown network
    const degree: Record<string, number> = {};
    for (const e of edgeRows) {
      degree[e.source] = (degree[e.source] ?? 0) + 1;
      degree[e.target] = (degree[e.target] ?? 0) + 1;
    }

    return Response.json({
      nodes: nodeRows.map((n) => ({
        id: n.pid,
        name: n.name ?? n.pid,
        caseCount: Number(n.cases),
        crimeGroup: n.crime_group ?? "Unknown",
        degree: degree[n.pid] ?? 0,
      })),
      edges: edgeRows.map((e) => ({
        source: e.source,
        target: e.target,
        weight: Number(e.weight),
      })),
    });
  } catch (e) {
    console.error("network-data failed:", e);
    return Response.json({ nodes: [], edges: [] });
  }
}
