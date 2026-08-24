import { scopedClient } from "./db";
import { similarCasesToText } from "./case-retrieval";

/**
 * Act/Section suggestion for a new FIR, argued from past filings.
 *
 * Wrong or missing sections are one of the quiet reasons a case falls apart
 * months later — the offence was written up correctly and charged wrongly. The
 * station writer picking from a list of forty-odd sections is exactly the task
 * where the record beats memory: whatever this station has filed before, some
 * other station has filed a hundred narratives that read like this one, and the
 * sections those files actually carry are evidence about this one.
 *
 * So the pipeline is: embed the brief facts, pull the nearest narratives with
 * the same pgvector search the MO linker uses, and count what those cases were
 * booked under — weighted by how close each narrative reads and discounted by
 * how ordinary the section is. Every suggestion carries its own receipts (how
 * many neighbours used it, and CrimeNos the officer can go and read).
 *
 * THIS IS NOT LEGAL ADVICE. It is a description of what was filed on similar
 * facts before. The officer decides what is charged; the UI says so too.
 */

export interface SectionRef {
  actCode: string;
  sectionCode: string;
}

/** One retrieved neighbour: how close it reads, and what it was actually booked under. */
export interface EvidenceCase {
  caseId: number;
  crimeNo: string | null;
  /** Cosine similarity of the narratives, 0..1. */
  score: number;
  sections: SectionRef[];
}

export interface SectionSuggestion extends SectionRef {
  description: string | null;
  /** 0..1 — weighted share of the neighbourhood, discounted for commonness. */
  confidence: number;
  /** How many of the retrieved similar cases carry this section. */
  usedByCases: number;
  /** Weighted share of the neighbourhood, before the commonness discount. */
  share: number;
  /** How often this section appears across the comparable corpus, 0..1. */
  baseRate: number;
  /** CrimeNos the officer can pull up and check the precedent against. */
  exampleCrimeNos: string[];
}

export interface RankOptions {
  /** Corpus-wide frequency per "ACT|SECTION", 0..1. Missing keys fall back to a small floor. */
  baseRates: Map<string, number>;
  /** Acts the chosen crime head permits. Empty/absent = no structural filter. */
  allowedActs?: Set<string> | null;
  descriptions?: Map<string, string | null>;
  topN?: number;
  minConfidence?: number;
}

export const key = (s: SectionRef) => `${s.actCode}|${s.sectionCode}`;

/** How many neighbours a section needs before it counts as a pattern rather than one file's quirk. */
const MIN_SUPPORTING_CASES = 2;
const DEFAULT_TOP_N = 5;
const DEFAULT_MIN_CONFIDENCE = 0.05;
const MAX_EXAMPLES = 3;
// No corpus count for a section means it is rare, not impossible — a floor keeps
// the discount finite instead of dividing by zero into a fake certainty.
const BASE_RATE_FLOOR = 1e-4;

/**
 * The ranking, as a pure function over already-retrieved cases so it can be
 * tested without a database.
 *
 * Two quantities decide the order:
 *
 *   share      — the similarity-weighted fraction of the neighbourhood carrying
 *                the section. A close narrative should count for more than a
 *                distant one, so each case votes with its cosine score.
 *   baseRate   — how much of the comparable corpus carries it anyway. A section
 *                attached to almost every case is not evidence of anything: if
 *                95% of files carry it, finding it on the neighbours too tells
 *                the officer nothing they did not already know.
 *
 * confidence = share - baseRate, floored at zero: the part of the neighbourhood
 * that is more than background. It stays in 0..1, reads as "how much of the
 * evidence is about THIS section rather than about the corpus", and a section as
 * common here as everywhere lands at zero instead of a flattering number.
 * Ties break on raw support, then on the section key, so the order is stable.
 */
export function rankSections(cases: EvidenceCase[], opts: RankOptions): SectionSuggestion[] {
  const { baseRates, allowedActs, descriptions, topN = DEFAULT_TOP_N, minConfidence = DEFAULT_MIN_CONFIDENCE } = opts;
  // Nothing read like these facts — say nothing. A guess dressed as a suggestion
  // is worse than the blank list the officer already knows how to handle.
  if (cases.length === 0) return [];

  const totalWeight = cases.reduce((sum, c) => sum + Math.max(0, c.score), 0);
  if (totalWeight <= 0) return [];

  type Acc = { ref: SectionRef; weight: number; count: number; examples: string[] };
  const acc = new Map<string, Acc>();

  for (const c of cases) {
    const w = Math.max(0, c.score);
    // One case carrying the same section twice must not vote twice.
    const seen = new Set<string>();
    for (const s of c.sections) {
      if (allowedActs && allowedActs.size > 0 && !allowedActs.has(s.actCode)) continue;
      const k = key(s);
      if (seen.has(k)) continue;
      seen.add(k);
      const a = acc.get(k) ?? { ref: s, weight: 0, count: 0, examples: [] };
      a.weight += w;
      a.count += 1;
      if (c.crimeNo && a.examples.length < MAX_EXAMPLES && !a.examples.includes(c.crimeNo)) a.examples.push(c.crimeNo);
      acc.set(k, a);
    }
  }

  const minCases = Math.min(MIN_SUPPORTING_CASES, cases.length);
  const out: SectionSuggestion[] = [];
  for (const [k, a] of acc) {
    if (a.count < minCases) continue;
    const share = a.weight / totalWeight;
    const baseRate = Math.max(baseRates.get(k) ?? 0, BASE_RATE_FLOOR);
    const confidence = Math.max(0, share - baseRate);
    if (confidence < minConfidence) continue;
    out.push({
      ...a.ref,
      description: descriptions?.get(k) ?? null,
      confidence,
      usedByCases: a.count,
      share,
      baseRate,
      exampleCrimeNos: a.examples,
    });
  }

  out.sort((x, y) => y.confidence - x.confidence || y.usedByCases - x.usedByCases || key(x).localeCompare(key(y)));
  return out.slice(0, topN);
}

// ---- the DB half ------------------------------------------------------------

export interface SuggestOptions {
  crimeMajorHeadId?: number | null;
  crimeMinorHeadId?: number | null;
  districtId?: number | null;
  /** Neighbours to retrieve. Enough that a count means something, few enough to stay one query. */
  topK?: number;
  topN?: number;
  /** Cases to drop from the evidence — the offline check hides the case it is asking about. */
  excludeCaseIds?: number[];
}

export interface SuggestResult {
  suggestions: SectionSuggestion[];
  /** How many similar cases the ranking actually looked at. */
  basedOnCases: number;
}

const DEFAULT_TOP_K = 30;
const MIN_FACTS_CHARS = 20;

type BaseRates = { rates: Map<string, number>; total: number };
const baseRateCache = new Map<string, { at: number; value: BaseRates }>();
const BASE_RATE_TTL_MS = 5 * 60 * 1000;

/**
 * How often each section appears across the whole readable corpus.
 *
 * Conditioning this on the chosen crime head was the obvious idea and measured
 * WORSE (top-3 recovery 90% -> 97.5% on the same sample when it was dropped):
 * the head already filters the candidates, so conditioning on it again flattens
 * every base rate towards 1/n and does nothing but shrink confidences until real
 * suggestions fall under the floor. Cached briefly because it is a full-table
 * aggregate that barely moves between two FIRs.
 */
async function corpusBaseRates(districtId: number | null): Promise<BaseRates> {
  const cacheKey = `${districtId ?? "all"}`;
  const hit = baseRateCache.get(cacheKey);
  if (hit && Date.now() - hit.at < BASE_RATE_TTL_MS) return hit.value;

  const db = scopedClient(districtId);
  const rows = await db.$queryRawUnsafe<{ actCode: string; sectionCode: string; n: number }[]>(
    `SELECT a."ActCode" as "actCode", a."SectionCode" as "sectionCode", count(DISTINCT a."CaseMasterID")::int as n
     FROM "ActSectionAssociation" a
     JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID"
     WHERE cm."BriefFactsEmbedding" IS NOT NULL
     GROUP BY 1, 2`
  );
  const totalRows = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int as n FROM "CaseMaster" cm WHERE cm."BriefFactsEmbedding" IS NOT NULL`
  );
  const total = Math.max(1, totalRows[0]?.n ?? 1);
  const rates = new Map<string, number>();
  for (const r of rows) rates.set(key({ actCode: r.actCode, sectionCode: r.sectionCode }), r.n / total);

  const value = { rates, total };
  baseRateCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

/**
 * The acts a crime head can carry at all. CrimeHeadActSection pins one act per
 * head (its SectionCode is only that head's canonical section, not the full
 * list), so the gate is at act level — the same filter the section picker in the
 * FIR form already applies, kept here so the API cannot suggest a Motor Vehicles
 * section under a murder head.
 */
async function allowedActsFor(districtId: number | null, crimeMajorHeadId: number | null): Promise<Set<string> | null> {
  if (!crimeMajorHeadId) return null;
  const rows = await scopedClient(districtId).$queryRawUnsafe<{ actCode: string }[]>(
    `SELECT "ActCode" as "actCode" FROM "CrimeHeadActSection" WHERE "CrimeHeadID" = $1`,
    crimeMajorHeadId
  );
  const acts = new Set(rows.map((r) => r.actCode));
  return acts.size > 0 ? acts : null;
}

/** Sections carried by a set of cases, and the human-readable text for each. */
async function sectionsOfCases(districtId: number | null, caseIds: number[]) {
  if (caseIds.length === 0) return { byCase: new Map<number, SectionRef[]>(), descriptions: new Map<string, string | null>() };
  const rows = await scopedClient(districtId).$queryRawUnsafe<
    { caseId: number; actCode: string; sectionCode: string; description: string | null }[]
  >(
    `SELECT a."CaseMasterID" as "caseId", a."ActCode" as "actCode", a."SectionCode" as "sectionCode",
            s."SectionDescription" as description
     FROM "ActSectionAssociation" a
     LEFT JOIN "Section" s ON s."ActCode" = a."ActCode" AND s."SectionCode" = a."SectionCode"
     WHERE a."CaseMasterID" = ANY($1::int[])`,
    caseIds
  );
  const byCase = new Map<number, SectionRef[]>();
  const descriptions = new Map<string, string | null>();
  for (const r of rows) {
    const ref = { actCode: r.actCode, sectionCode: r.sectionCode };
    const list = byCase.get(r.caseId) ?? [];
    list.push(ref);
    byCase.set(r.caseId, list);
    descriptions.set(key(ref), r.description);
  }
  return { byCase, descriptions };
}

/** Suggest sections for free-text brief facts, each backed by the past filings behind it. */
export async function suggestSections(briefFacts: string, opts: SuggestOptions = {}): Promise<SuggestResult> {
  const { crimeMajorHeadId = null, crimeMinorHeadId = null, districtId = null, topK = DEFAULT_TOP_K, topN, excludeCaseIds = [] } = opts;
  void crimeMinorHeadId; // the minor head narrows nothing in this schema - only the major head links to acts
  const facts = briefFacts.trim();
  if (facts.length < MIN_FACTS_CHARS) return { suggestions: [], basedOnCases: 0 };

  // Retrieval is driven by the facts alone, not by the head the officer picked:
  // if the narrative reads like a robbery, the robbery files should be allowed
  // to say so even when the head was set carelessly. The head filters afterwards.
  const exclude = new Set(excludeCaseIds);
  const neighbours = (await similarCasesToText(facts, { topK: topK + exclude.size, districtId })).filter((c) => !exclude.has(c.id)).slice(0, topK);
  if (neighbours.length === 0) return { suggestions: [], basedOnCases: 0 };

  const [{ byCase, descriptions }, base, allowedActs] = await Promise.all([
    sectionsOfCases(districtId, neighbours.map((c) => c.id)),
    corpusBaseRates(districtId),
    allowedActsFor(districtId, crimeMajorHeadId),
  ]);

  const evidence: EvidenceCase[] = neighbours.map((c) => ({
    caseId: c.id,
    crimeNo: c.crimeNo,
    score: c.score,
    sections: byCase.get(c.id) ?? [],
  }));

  return {
    suggestions: rankSections(evidence, { baseRates: base.rates, allowedActs, descriptions, topN }),
    basedOnCases: neighbours.length,
  };
}
