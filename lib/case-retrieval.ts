import { scopedClient } from "./db";
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
  /**
   * Raw pgvector cosine. Kept because callers need something to sort on, but it
   * is NOT a confidence — see SIMILAR_CASE_MIN_SCORE. Present it as a position,
   * not a percentage.
   */
  score: number;
  /** 1-based position among the returned neighbours. This is the honest number. */
  rank: number;
}

/**
 * The one floor for "linked cases", shared by every caller so two panels on the
 * same screen can never disagree about what a link is.
 *
 * It is zero, and that is the measured answer rather than an oversight.
 *
 * Measured 2026-08-25 against the live corpus (mistral-embed 1024-d, cosine on
 * CaseMaster.BriefFactsEmbedding):
 *
 *   nearest neighbour, 300 random cases   min .878  p05 .892  med .923  max .958
 *   5th neighbour, same sample            min .865  p05 .883  med .912  max .944
 *   known series pairs (same PersonID,
 *     same crime group), n=2000           min .776  med .872  p95 .922
 *   unrelated pairs, same crime group,
 *     n=2000                              min .752  med .835  p95 .880
 *
 * Two things follow. First, every floor this codebase used to carry — 0.5, 0.72,
 * 0.78, even 0.86 — sits at or below the minimum of the top-5 distribution, so
 * none of them ever rejected a neighbour: they were decoration. Second, no floor
 * that would reject anything is worth setting, because the series and unrelated
 * distributions overlap almost completely: a cut at .86 keeps 66% of real series
 * pairs but also 18% of unrelated same-group pairs, and a cut at .90 drops to
 * 18% recall while still passing 90% of nearest neighbours. `eval/similarity.ts`
 * says the same thing from the other end — seriesRecallAt5 is 18%.
 *
 * So the cosine cannot carry a decision, and pretending otherwise by dressing it
 * up as "92% match" is the failure mode. These functions return the K closest
 * narratives, ranked, and the UI says "closest narratives", not "92% match". A
 * decision that needs a real gate has to bring a second signal: duplicate-detect
 * requires a matching complainant or victim, and the MO alert in alerts.ts
 * requires both an outlier score and a matching offence type.
 */
export const SIMILAR_CASE_MIN_SCORE = 0;

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
  opts: { topK?: number; excludeDistrict?: string | null; sameCrimeGroup?: boolean; minScore?: number; districtId?: number | null } = {}
): Promise<RelatedCase[]> {
  const { topK = 5, excludeDistrict = null, sameCrimeGroup = false, minScore = SIMILAR_CASE_MIN_SCORE, districtId = null } = opts;
  const rows = await scopedClient(districtId).$queryRawUnsafe<RelatedCase[]>(
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
  return withRank(rows.filter((r) => r.score >= minScore));
}

/** Stamps the 1-based position onto each row — the number callers should show. */
function withRank(rows: RelatedCase[]): RelatedCase[] {
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Same linker, but from a free-text description of a method ("two men on a black Pulsar cutting window grilles at night"). */
export async function similarCasesToText(text: string, opts: { topK?: number; excludeDistrict?: string | null; minScore?: number; districtId?: number | null } = {}): Promise<RelatedCase[]> {
  const { topK = 5, excludeDistrict = null, minScore = SIMILAR_CASE_MIN_SCORE, districtId = null } = opts;
  const v = toVectorLiteral(await embedText(text));
  const rows = await scopedClient(districtId).$queryRawUnsafe<RelatedCase[]>(
    `SELECT ${CASE_COLUMNS}, 1 - (cm."BriefFactsEmbedding" <=> $1::vector) as score
     ${CASE_JOINS}
     WHERE cm."BriefFactsEmbedding" IS NOT NULL ${excludeDistrict ? `AND d."DistrictName" <> $3` : ""}
     ORDER BY cm."BriefFactsEmbedding" <=> $1::vector
     LIMIT $2`,
    ...(excludeDistrict ? [v, topK, excludeDistrict] : [v, topK])
  );
  return withRank(rows.filter((r) => r.score >= minScore));
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
async function findSimilarCasesFTS(query: string, topK: number, districtId?: number | null): Promise<RelatedCase[]> {
  const queryWords = tokenize(query);
  const tsq = toOrQuery(queryWords);
  if (!tsq) return [];

  const candidates = await scopedClient(districtId).$queryRawUnsafe<RelatedCase[]>(
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
  return withRank(candidates
    .filter((c) => {
      if (!c.briefFacts) return false;
      const docWords = new Set(tokenize(c.briefFacts));
      const overlap = queryWords.filter((w) => docWords.has(w)).length;
      return overlap >= minOverlap;
    })
    .slice(0, topK));
}

/** Semantic similarity via pgvector cosine distance on Gemini embeddings — catches paraphrases FTS misses. */
async function findSimilarCasesVector(query: string, topK: number, districtId?: number | null): Promise<RelatedCase[]> {
  const embedding = await embedText(query);
  const vectorLiteral = `[${embedding.join(",")}]`;

  return withRank(await scopedClient(districtId).$queryRawUnsafe<RelatedCase[]>(
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
  ));
}

export async function findSimilarCases(query: string, topK = 5, districtId?: number | null): Promise<RelatedCase[]> {
  if (embeddingAvailable()) {
    try {
      const results = await findSimilarCasesVector(query, topK, districtId);
      if (results.length > 0) return results;
    } catch (e) {
      console.error("vector case search failed, falling back to FTS:", e);
    }
  }
  return findSimilarCasesFTS(query, topK, districtId);
}
