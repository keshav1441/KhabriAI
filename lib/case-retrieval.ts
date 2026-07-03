import { prisma } from "./db";

export interface RelatedCase {
  id: number;
  crimeNo: string | null;
  briefFacts: string | null;
  crimeGroup: string | null;
  district: string | null;
  score: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

// ponytail: OR'd tsquery (not plainto_tsquery's AND) so natural-language questions
// still match on partial keyword overlap; ts_rank sorts the best overlap to the top.
function toOrQuery(words: string[]): string {
  return words.map((w) => w.replace(/'/g, "''")).join(" | ");
}

// ts_rank alone isn't reliable here (short docs, generic verbs like "filed"/"month" leak into
// narratives and coincidentally out-rank a real single-term hit). Require >=2 literal content-word
// overlaps between query and narrative as the real precision gate — score is used only to rank
// among candidates that already clear this bar.
const MIN_OVERLAP = 2;

export async function findSimilarCases(query: string, topK = 5): Promise<RelatedCase[]> {
  const queryWords = tokenize(query);
  const tsq = toOrQuery(queryWords);
  if (!tsq) return [];

  const candidates = await prisma.$queryRawUnsafe<RelatedCase[]>(
    `SELECT cm."CaseMasterID" as id, cm."CrimeNo" as "crimeNo", cm."BriefFacts" as "briefFacts",
            ch."CrimeGroupName" as "crimeGroup", d."DistrictName" as district,
            ts_rank(to_tsvector('english', cm."BriefFacts"), to_tsquery('english', $1), 32) as score
     FROM "CaseMaster" cm
     LEFT JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
     LEFT JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
     LEFT JOIN "District" d ON d."DistrictID" = u."DistrictID"
     WHERE to_tsvector('english', cm."BriefFacts") @@ to_tsquery('english', $1)
     ORDER BY score DESC
     LIMIT $2`,
    tsq,
    topK * 4
  );

  const minOverlap = Math.min(MIN_OVERLAP, queryWords.length);
  return candidates
    .filter((c) => {
      if (!c.briefFacts) return false;
      const docWords = new Set(tokenize(c.briefFacts));
      const overlap = queryWords.filter((w) => docWords.has(w)).length;
      return overlap >= minOverlap;
    })
    .slice(0, topK);
}
