import { prisma } from "./db";
import { embedText, embeddingAvailable, toVectorLiteral } from "./embeddings";

export interface RelatedCase {
  id: number;
  crimeNo: string | null;
  briefFacts: string | null;
  crimeGroup: string | null;
  crimeType?: string | null;
  district: string | null;
  station?: string | null;
  status?: string | null;
  registered?: string | null;
  score: number;
}

const CASE_COLUMNS = `cm."CaseMasterID" as id, cm."CrimeNo" as "crimeNo", cm."BriefFacts" as "briefFacts",
            ch."CrimeGroupName" as "crimeGroup", csh."CrimeHeadName" as "crimeType", d."DistrictName" as district,
            u."UnitName" as station, cs."CaseStatusName" as status, to_char(cm."CrimeRegisteredDate", 'YYYY-MM-DD') as registered`;
const CASE_JOINS = `FROM "CaseMaster" cm
     LEFT JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
     LEFT JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
     LEFT JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
     LEFT JOIN "District" d ON d."DistrictID" = u."DistrictID"
     LEFT JOIN "CaseStatusMaster" cs ON cs."CaseStatusID" = cm."CaseStatusID"`;

/**
 * Modus-operandi linking: the cases whose narratives are closest to a given
 * case's narrative (cosine on BriefFactsEmbedding), excluding the case itself.
 * Narratives never name the accused, so a hit means the METHOD matches - the
 * kind of link a single station, seeing only its own FIRs, cannot make.
 */
export async function similarCasesTo(
  caseId: number,
  opts: { topK?: number; excludeDistrict?: string | null; sameCrimeGroup?: boolean; minScore?: number } = {}
): Promise<RelatedCase[]> {
  const { topK = 5, excludeDistrict = null, sameCrimeGroup = false, minScore = 0 } = opts;
  const rows = await prisma.$queryRawUnsafe<RelatedCase[]>(
    `WITH src AS (SELECT "BriefFactsEmbedding" AS e, "CrimeMajorHeadID" AS g FROM "CaseMaster" WHERE "CaseMasterID" = $1)
     SELECT ${CASE_COLUMNS}, 1 - (cm."BriefFactsEmbedding" <=> src.e) as score
     ${CASE_JOINS}, src
     WHERE cm."BriefFactsEmbedding" IS NOT NULL AND src.e IS NOT NULL AND cm."CaseMasterID" <> $1
       ${excludeDistrict ? `AND d."DistrictName" <> $3` : ""}
       ${sameCrimeGroup ? `AND cm."CrimeMajorHeadID" = src.g` : ""}
     ORDER BY cm."BriefFactsEmbedding" <=> src.e
     LIMIT $2`,
    ...(excludeDistrict ? [caseId, topK, excludeDistrict] : [caseId, topK])
  );
  return rows.filter((r) => r.score >= minScore);
}

/** Same linker, but from a free-text description of a method ("two men on a black Pulsar cutting window grilles at night"). */
export async function similarCasesToText(text: string, opts: { topK?: number; excludeDistrict?: string | null } = {}): Promise<RelatedCase[]> {
  const { topK = 5, excludeDistrict = null } = opts;
  const v = toVectorLiteral(await embedText(text));
  return prisma.$queryRawUnsafe<RelatedCase[]>(
    `SELECT ${CASE_COLUMNS}, 1 - (cm."BriefFactsEmbedding" <=> $1::vector) as score
     ${CASE_JOINS}
     WHERE cm."BriefFactsEmbedding" IS NOT NULL ${excludeDistrict ? `AND d."DistrictName" <> $3` : ""}
     ORDER BY cm."BriefFactsEmbedding" <=> $1::vector
     LIMIT $2`,
    ...(excludeDistrict ? [v, topK, excludeDistrict] : [v, topK])
  );
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

/** Keyword full-text search — misses paraphrases ("theft" vs "stolen") but needs no embedding call. */
async function findSimilarCasesFTS(query: string, topK: number): Promise<RelatedCase[]> {
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

/** Semantic similarity via pgvector cosine distance on Gemini embeddings — catches paraphrases FTS misses. */
async function findSimilarCasesVector(query: string, topK: number): Promise<RelatedCase[]> {
  const embedding = await embedText(query);
  const vectorLiteral = `[${embedding.join(",")}]`;

  return prisma.$queryRawUnsafe<RelatedCase[]>(
    `SELECT cm."CaseMasterID" as id, cm."CrimeNo" as "crimeNo", cm."BriefFacts" as "briefFacts",
            ch."CrimeGroupName" as "crimeGroup", d."DistrictName" as district,
            1 - (cm."BriefFactsEmbedding" <=> $1::vector) as score
     FROM "CaseMaster" cm
     LEFT JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
     LEFT JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
     LEFT JOIN "District" d ON d."DistrictID" = u."DistrictID"
     WHERE cm."BriefFactsEmbedding" IS NOT NULL
     ORDER BY cm."BriefFactsEmbedding" <=> $1::vector
     LIMIT $2`,
    vectorLiteral,
    topK
  );
}

export async function findSimilarCases(query: string, topK = 5): Promise<RelatedCase[]> {
  if (embeddingAvailable()) {
    try {
      const results = await findSimilarCasesVector(query, topK);
      if (results.length > 0) return results;
    } catch (e) {
      console.error("vector case search failed, falling back to FTS:", e);
    }
  }
  return findSimilarCasesFTS(query, topK);
}
