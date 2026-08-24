import { scopedClient, type Db } from "./db";
import { similarity } from "./entity-resolve";

/**
 * Identity resolution — is this the same human, written down twice?
 *
 * Everything else in this codebase that follows a person across files — the
 * crew dossier, repeat-offender alerts, the offender profile — leans on
 * `Accused.PersonID`. That column exists because the corpus is synthetic. Real
 * KSP registers do not carry one: an accused is typed into each FIR by hand at
 * whichever station took it, and nothing joins those rows together. Any of this
 * that is meant to survive contact with production has to earn the join instead
 * of being handed it, which is what this file does.
 *
 * So PersonID is deliberately NOT a signal here. It is only ever used as the
 * answer key — `evaluateIdentity()` scores this approach against it, so we can
 * say how much of the current behaviour survives the crutch being taken away.
 *
 * What the schema actually gives us (verified against prisma/schema.prisma, not
 * assumed): `Accused` has AccusedName, AgeYear, GenderID and nothing else that
 * identifies. There is no parentage, no address, no father's name, no ID
 * number — the fields a real register would use to disambiguate two men called
 * Ravi Kumar are simply not modelled. The only other facts available are the
 * ones the FIR carries: when it was registered and where. So the signals are
 * name, age-with-drift, gender, and locality as weak corroboration.
 *
 * Which means the honest answer is a ranked list of candidates with the reasons
 * attached, never a merge. Nothing here rewrites a record or collapses two rows
 * into one; the officer is shown who might be the same person and decides.
 *
 * Runs inside the caller's scope exactly like the crew walk — a district-posted
 * officer only ever gets candidates from files RLS lets them read.
 */

// ---- name normalisation -----------------------------------------------------

// Honorifics carry no identity. Two clerks writing the same man rarely agree on
// whether he is "Sri Ravi Kumar", "Ravi Kumar" or "Kumar, Ravi (S/o Nanjappa)".
const HONORIFICS = /\b(sri|shri|smt|smti|kum|kumari|mr|mrs|ms|md|dr|late|thiru)\b\.?/gi;

// The "s/o", "w/o", "d/o" tail is parentage written into the name field, which
// is where it ends up when there is nowhere else to put it. It would be a real
// signal if the schema had a column for it — it does not, and the tail is too
// inconsistently written to compare directly, so it is stripped rather than
// left in to drag the similarity of two matching names down.
const RELATION_TAIL = /\b[swd]\s*[\/.]?\s*o\b.*$/i;

/** Lowercased, honorific-free, punctuation-free — "Sri R. Kumar" → "r kumar". */
export function normaliseName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(HONORIFICS, " ")
    .replace(RELATION_TAIL, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameTokens(raw: string): string[] {
  return normaliseName(raw).split(" ").filter(Boolean);
}

// ---- name comparison --------------------------------------------------------

export type TokenMatchKind = "exact" | "initial" | "variant";

export interface TokenMatch {
  a: string;
  b: string;
  kind: TokenMatchKind;
  score: number;
}

export interface NameComparison {
  /** 0..1 over the LONGER name, so "Ravi" vs "Ravi Kumar" scores 0.5, not 1. */
  score: number;
  normalisedA: string;
  normalisedB: string;
  matches: TokenMatch[];
  /** Pairs matched as whole words — the part that actually identifies. */
  fullMatches: number;
  /** Pairs matched only as an initial against a word ("R." vs "Ravi"). */
  initialMatches: number;
  label: string | null;
}

/**
 * Two written names, compared token by token.
 *
 * Whole-string trigram similarity is the wrong instrument here: it rates
 * "Ravi Kumar" against "R. Kumar" barely above "Ravi Kumar" against "Ravi
 * Kumara Swamy", when the first is very probably one man and the second is
 * probably two. Aligning tokens instead lets an initial match its own word,
 * and — more importantly — divides by the LONGER name, so a name that is
 * merely a prefix of another is scored as the partial match it is.
 */
export function compareNames(rawA: string, rawB: string): NameComparison {
  const a = nameTokens(rawA);
  const b = nameTokens(rawB);
  const empty: NameComparison = {
    score: 0, normalisedA: a.join(" "), normalisedB: b.join(" "),
    matches: [], fullMatches: 0, initialMatches: 0, label: null,
  };
  if (!a.length || !b.length) return empty;

  // Every plausible pairing, best first; each token may be spent once. Greedy
  // is enough — names are three tokens long, not thirty.
  const pairs: { i: number; j: number; m: TokenMatch }[] = [];
  a.forEach((x, i) =>
    b.forEach((y, j) => {
      const m = matchToken(x, y);
      if (m) pairs.push({ i, j, m });
    })
  );
  pairs.sort((p, q) => q.m.score - p.m.score);

  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const matches: TokenMatch[] = [];
  for (const p of pairs) {
    if (usedA.has(p.i) || usedB.has(p.j)) continue;
    usedA.add(p.i);
    usedB.add(p.j);
    matches.push(p.m);
  }

  const total = matches.reduce((acc, m) => acc + m.score, 0);
  const score = total / Math.max(a.length, b.length);
  return {
    score: Number(score.toFixed(3)),
    normalisedA: a.join(" "),
    normalisedB: b.join(" "),
    matches,
    fullMatches: matches.filter((m) => m.kind !== "initial").length,
    initialMatches: matches.filter((m) => m.kind === "initial").length,
    label: matches.length ? `${rawA.trim()} ≡ ${rawB.trim()}` : null,
  };
}

function matchToken(x: string, y: string): TokenMatch | null {
  if (x === y) return { a: x, b: y, kind: "exact", score: 1 };
  // An initial stands for the word it starts. Worth slightly less than the
  // word itself, because "R." also stands for Rajesh, Ramesh and Ravindra.
  if (x.length === 1 || y.length === 1) {
    const [short, long] = x.length === 1 ? [x, y] : [y, x];
    return long.startsWith(short) ? { a: x, b: y, kind: "initial", score: IDENT.initialScore } : null;
  }
  // Transliteration wobble: Gowda/Gouda, Reddy/Reddi, Shetty/Setty.
  if (x.length >= 3 && y.length >= 3) {
    const s = similarity(x, y);
    if (s >= IDENT.tokenVariantFloor) return { a: x, b: y, kind: "variant", score: Number(s.toFixed(3)) };
  }
  return null;
}

// ---- age drift --------------------------------------------------------------

/**
 * Which reading of the two ages we ended up believing. "drift" is the honest
 * one: the age moved the way a calendar says it should. "carried" is the age
 * that did not move at all across years — a clerk copying the previous file's
 * figure rather than asking again, which is extremely common in a real register
 * and is how the synthetic corpus records age too.
 */
export type AgeBasis = "drift" | "carried";

export interface AgeConsistency {
  score: number;
  /** How far the second record's age is from what the first one predicts. */
  residual: number;
  tolerance: number;
  consistent: boolean;
  basis: AgeBasis;
}

/**
 * Age is only a signal once you account for the calendar: a person is a year
 * older every year, so 34 in a 2021 FIR and 37 in a 2024 FIR is the SAME
 * person, while 34 and 37 in two FIRs from the same month is two people.
 * Comparing the raw numbers gets this exactly backwards, which is why so many
 * naive matchers quietly split every repeat offender's record in half.
 *
 * `yearsApart` is signed and fractional (b minus a). Null means at least one
 * FIR is undated, and then the most we can do is be lenient and lean on the
 * other signals.
 *
 * The second reading — an age that has not moved at all across several years —
 * has to be allowed too, or this signal rules out exactly the people it is
 * supposed to find. Stations copy the age forward from the last file instead of
 * asking again; this corpus does it in every single record. A carried age is
 * weaker evidence than a correctly drifted one, so it is scored slightly lower,
 * but treating it as a contradiction would be a modelling error, not rigour.
 */
export function ageConsistency(
  ageA: number | null,
  ageB: number | null,
  yearsApart: number | null
): AgeConsistency | null {
  if (ageA == null || ageB == null) return null;
  const drift = Math.abs(ageB - (ageA + (yearsApart ?? 0)));
  const carried = Math.abs(ageB - ageA);
  // Ties go to drift: when the two files are from the same year the readings
  // are identical, and the calendar-correct one is the one to name.
  const basis: AgeBasis = drift <= carried ? "drift" : "carried";
  const residual = Math.min(drift, carried);
  // Ages in a register are frequently estimated ("about 30") and rounded to the
  // nearest five, so a couple of years is normal even between two files written
  // the same week. The slack grows with the gap because the estimate drifts.
  const tolerance =
    yearsApart == null
      ? IDENT.ageMaxTolerance
      : Math.min(IDENT.ageMaxTolerance, IDENT.ageBaseTolerance + IDENT.ageSlackPerYear * Math.abs(yearsApart));
  const raw = clamp01(1 - residual / tolerance);
  return {
    score: basis === "carried" ? Number((raw * IDENT.carriedAgePenalty).toFixed(3)) : raw,
    residual: Number(residual.toFixed(2)),
    tolerance: Number(tolerance.toFixed(2)),
    consistent: residual <= tolerance,
    basis,
  };
}

// ---- signals ----------------------------------------------------------------

/** The already-fetched facts about one pair of accused rows. No database. */
export interface IdentitySignals {
  nameA: string | null;
  nameB: string | null;
  ageA: number | null;
  ageB: number | null;
  /** Signed, fractional years between the two FIRs; null when either is undated. */
  yearsApart: number | null;
  genderA: number | null;
  genderB: number | null;
  /** Null when either record's district is unknown. */
  sameDistrict: boolean | null;
}

export type IdentitySignalName = "name" | "age" | "gender" | "locality";

export interface IdentityReason {
  signal: IdentitySignalName;
  /** What this signal contributed to the confidence, 0..1. */
  weight: number;
  label: string;
}

/** Why a score was held down. Every cap is a refusal to assert, not a filter. */
export type IdentityCap = "thin-name" | "weak-name" | "age-inconsistent" | "gender-mismatch" | null;

export interface IdentityScore {
  confidence: number;
  isLikely: boolean;
  reasons: IdentityReason[];
  capped: IdentityCap;
  name: NameComparison;
  age: AgeConsistency | null;
}

// ---- thresholds -------------------------------------------------------------

export const IDENT = {
  /** An initial is worth most of its word, but not all of it. */
  initialScore: 0.85,
  /** Trigram floor for two spellings to count as the same token. */
  tokenVariantFloor: 0.7,
  /** Below this the two names are simply not the same name. */
  nameGate: 0.7,
  /** Age tolerance: base years, plus slack for every year of drift, capped. */
  ageBaseTolerance: 2,
  ageSlackPerYear: 0.5,
  ageMaxTolerance: 5,
  /** An age copied forward from the last file corroborates, but less. */
  carriedAgePenalty: 0.9,
  /** At or above this the pair is worth showing to an officer as a candidate. */
  threshold: 0.6,
  /**
   * The single most important guard in the file. "Ravi" matching "Ravi Kumar",
   * or "Ravi Kumar" matching "Ravi Shetty", is a common given name doing all
   * the work — in this corpus one written name is shared by five different
   * people on average. A candidate needs at least two aligned tokens with at
   * least one of them a whole word, or it is capped below the bar no matter
   * how well the age and gender line up.
   */
  thinNameCap: 0.45,
  /** Names that are not the same name cannot be rescued by demographics. */
  weakNameCap: 0.35,
  /**
   * An impossible age trajectory is the strongest disqualifier available, and
   * the whole reason for computing drift. Still not zero: ages get mistyped,
   * and the officer should see a near miss on a rare name.
   */
  ageInconsistentCap: 0.35,
  /**
   * Gender disagreement is close to a veto. It is a single digit in the
   * register and is not usually wrong; when it is, the record is shown low
   * rather than hidden.
   */
  genderMismatchCap: 0.2,
  /**
   * A signal is listed as a reason once it CONTRIBUTES this much. Firing on the
   * raw sub-score instead would put "files in different districts" in front of
   * an officer as though it were evidence of anything.
   */
  reasonFires: 0.05,
} as const;

/**
 * Weights, and why.
 *
 *  name     .55 — the only signal that IDENTIFIES. Everything else narrows a
 *                 field of candidates; nothing else picks a person out of it.
 *                 Still kept just above half, because a name on its own is
 *                 exactly the failure mode (see thinNameCap).
 *  age      .25 — the strongest corroborator once drift is accounted for, and
 *                 the only signal that can positively rule a candidate OUT.
 *  gender   .12 — nearly free agreement (85% of this register is male), so it
 *                 earns little by matching. Its value is in the mismatch cap.
 *  locality .08 — an offender's files cluster in one district, but the whole
 *                 point of resolving identity is the man who works across
 *                 boundaries, so this can never be more than a nudge.
 */
const WEIGHTS: Record<IdentitySignalName, number> = {
  name: 0.55,
  age: 0.25,
  gender: 0.12,
  locality: 0.08,
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Pure scoring — signals in, confidence and reasons out. No database, no
 * network, so the whole judgement can be tested on its own and the API, the
 * evaluation harness and the UI all assert on exactly the same rules.
 */
export function scoreIdentity(s: IdentitySignals): IdentityScore {
  const name = compareNames(s.nameA ?? "", s.nameB ?? "");
  const age = ageConsistency(s.ageA, s.ageB, s.yearsApart);
  const genderKnown = s.genderA != null && s.genderB != null;
  const genderAgrees = genderKnown && s.genderA === s.genderB;

  const sub: Record<IdentitySignalName, number> = {
    name: name.score,
    age: age?.score ?? 0,
    gender: genderAgrees ? 1 : 0,
    // Same district corroborates a little. A different district is not
    // evidence against — a man who works across a boundary is the whole reason
    // this feature exists — it simply says nothing, so it scores nothing.
    locality: s.sameDistrict === true ? 1 : 0,
  };

  const names = Object.keys(WEIGHTS) as IdentitySignalName[];
  let confidence = names.reduce((acc, k) => acc + sub[k] * WEIGHTS[k], 0);

  // Conservatism, weakest cap first so the strongest one wins the label.
  let capped: IdentityCap = null;
  const thinName = name.matches.length < 2 || name.fullMatches < 1;
  if (thinName && confidence > IDENT.thinNameCap) {
    confidence = IDENT.thinNameCap;
    capped = "thin-name";
  }
  if (name.score < IDENT.nameGate && confidence > IDENT.weakNameCap) {
    confidence = IDENT.weakNameCap;
    capped = "weak-name";
  }
  if (age && !age.consistent && confidence > IDENT.ageInconsistentCap) {
    confidence = IDENT.ageInconsistentCap;
    capped = "age-inconsistent";
  }
  if (genderKnown && !genderAgrees && confidence > IDENT.genderMismatchCap) {
    confidence = IDENT.genderMismatchCap;
    capped = "gender-mismatch";
  }

  const reasons: IdentityReason[] = names
    .map((k) => ({ signal: k, weight: Number((sub[k] * WEIGHTS[k]).toFixed(3)), label: labelFor(k, s, name, age) }))
    .filter((r) => r.weight >= IDENT.reasonFires)
    .sort((a, b) => b.weight - a.weight);

  return {
    confidence: Number(confidence.toFixed(3)),
    isLikely: confidence >= IDENT.threshold,
    reasons,
    capped,
    name,
    age,
  };
}

function labelFor(
  k: IdentitySignalName,
  s: IdentitySignals,
  name: NameComparison,
  age: AgeConsistency | null
): string {
  switch (k) {
    case "name": {
      if (name.score >= 0.999) return `Same name — ${s.nameA?.trim() ?? ""}`;
      if (name.initialMatches) return `Name matches on initials — ${name.label}`;
      return `Name reads the same — ${name.label}`;
    }
    case "age": {
      const gap = s.yearsApart == null ? null : Math.abs(s.yearsApart);
      if (gap == null) return `Age recorded as ${s.ageA} and ${s.ageB}, files undated`;
      if (gap < 0.5) return `Same age (${s.ageA}) in files from the same year`;
      if (age?.basis === "carried")
        return `Age unchanged at ${s.ageB} across ${gap.toFixed(1)} years — carried forward, not re-asked`;
      return `Age ${s.ageA} → ${s.ageB} across ${gap.toFixed(1)} years — the drift fits`;
    }
    case "gender":
      return "Gender agrees";
    case "locality":
      return "Both files in the same district";
  }
}

// ---- database ---------------------------------------------------------------

export interface IdentityOptions {
  /** Only return candidates at or above this confidence. */
  minConfidence?: number;
  /** How many rows the name prefilter may pull back before scoring. */
  candidateLimit?: number;
  /** Cap on ranked candidates returned. */
  limit?: number;
  districtId?: number | null;
}

export interface AccusedRecord {
  accusedId: number;
  caseId: number;
  crimeNo: string | null;
  name: string | null;
  age: number | null;
  genderId: number | null;
  district: string | null;
  station: string | null;
  crimeType: string | null;
  registered: string | null;
  /** Ground truth only. Never scored — carried so the harness can grade. */
  personId: string | null;
}

export interface IdentityCandidate extends AccusedRecord {
  confidence: number;
  isLikely: boolean;
  reasons: IdentityReason[];
  capped: IdentityCap;
  signals: IdentitySignals;
  /** True when the corpus's own PersonID agrees. Display only, never scored. */
  personIdAgrees: boolean | null;
}

export interface IdentityResult {
  seed: AccusedRecord;
  candidates: IdentityCandidate[];
  /** Rows the name prefilter pulled back, before scoring rejected most of them. */
  considered: number;
}

const DEFAULTS = {
  minConfidence: IDENT.threshold,
  candidateLimit: 400,
  limit: 25,
};

type Row = {
  accused_id: number; case_id: number; crime_no: string | null; name: string | null;
  age: number | null; gender_id: number | null; district: string | null; station: string | null;
  crime_type: string | null; registered: string | null; person_id: string | null;
};

// Everything an accused row needs to be judged, plus where and when its FIR was
// filed. The date is what makes age drift computable at all.
const SELECT = `
  SELECT a."AccusedMasterID" AS accused_id, a."CaseMasterID" AS case_id,
         cm."CrimeNo" AS crime_no, a."AccusedName" AS name, a."AgeYear" AS age,
         a."GenderID" AS gender_id, d."DistrictName" AS district, u."UnitName" AS station,
         csh."CrimeHeadName" AS crime_type,
         to_char(COALESCE(cm."IncidentFromDate", cm."CrimeRegisteredDate"), 'YYYY-MM-DD') AS registered,
         a."PersonID" AS person_id
  FROM "Accused" a
  JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID"
  LEFT JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
  LEFT JOIN "District" d ON d."DistrictID" = u."DistrictID"
  LEFT JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"`;

const toRecord = (r: Row): AccusedRecord => ({
  accusedId: r.accused_id,
  caseId: r.case_id,
  crimeNo: r.crime_no,
  name: r.name,
  age: r.age == null ? null : Number(r.age),
  genderId: r.gender_id == null ? null : Number(r.gender_id),
  district: r.district,
  station: r.station,
  crimeType: r.crime_type,
  registered: r.registered,
  personId: r.person_id,
});

/** Decimal year, so two FIRs three months apart are 0.25 years apart. */
function decimalYear(iso: string | null): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y) return null;
  return y + ((m - 1) + (d - 1) / 31) / 12;
}

export function yearsBetween(a: string | null, b: string | null): number | null {
  const ya = decimalYear(a);
  const yb = decimalYear(b);
  return ya == null || yb == null ? null : Number((yb - ya).toFixed(3));
}

/** Score one already-fetched row against the seed. */
export function scoreAgainst(seed: AccusedRecord, other: AccusedRecord): IdentityCandidate {
  const signals: IdentitySignals = {
    nameA: seed.name,
    nameB: other.name,
    ageA: seed.age,
    ageB: other.age,
    yearsApart: yearsBetween(seed.registered, other.registered),
    genderA: seed.genderId,
    genderB: other.genderId,
    sameDistrict: seed.district && other.district ? seed.district === other.district : null,
  };
  const scored = scoreIdentity(signals);
  return {
    ...other,
    confidence: scored.confidence,
    isLikely: scored.isLikely,
    reasons: scored.reasons,
    capped: scored.capped,
    signals,
    personIdAgrees:
      seed.personId && other.personId ? seed.personId === other.personId : null,
  };
}

async function fetchSeed(db: Db, seed: { accusedId?: number | null; personId?: string | null }) {
  if (seed.accusedId) {
    const rows = await db.$queryRawUnsafe<Row[]>(`${SELECT} WHERE a."AccusedMasterID" = $1 LIMIT 1`, seed.accusedId);
    return rows.length ? toRecord(rows[0]) : null;
  }
  if (seed.personId) {
    // The convenience path. PersonID here is a LOOKUP, not a signal: it only
    // picks which single row we start from, and the row is then matched on its
    // own name/age/gender exactly as an unlabelled record would be.
    const rows = await db.$queryRawUnsafe<Row[]>(
      `${SELECT} WHERE a."PersonID" = $1
       ORDER BY COALESCE(cm."IncidentFromDate", cm."CrimeRegisteredDate") DESC NULLS LAST LIMIT 1`,
      seed.personId
    );
    return rows.length ? toRecord(rows[0]) : null;
  }
  return null;
}

/**
 * Candidate generation. There is no pg_trgm on this database (checked: only
 * plpgsql and vector are installed), so the prefilter is a token LIKE — every
 * accused row whose name contains any substantive word of the seed's name.
 * That is deliberately generous; recall matters here and precision is the
 * scorer's job. On a real register this would be a trigram index instead, and
 * the only thing that would change is this one WHERE clause.
 *
 * The ORDER BY is not cosmetic. A surname like "Shetty" appears in thousands of
 * rows, so the limit truncates the pool — and if the pool is ordered by id, the
 * rows it keeps are an arbitrary slice that mostly does not contain the person
 * we are looking for. Putting the exact-name rows first means the limit throws
 * away the weakest candidates instead of the strongest ones.
 */
async function fetchCandidates(db: Db, seed: AccusedRecord, limit: number): Promise<AccusedRecord[]> {
  const tokens = nameTokens(seed.name ?? "").filter((t) => t.length >= 3);
  if (!tokens.length) return [];
  const patterns = tokens.map((t) => `%${t}%`);
  const rows = await db.$queryRawUnsafe<Row[]>(
    `${SELECT}
     WHERE a."AccusedMasterID" <> $1
       AND a."AccusedName" IS NOT NULL
       AND lower(a."AccusedName") LIKE ANY($2::text[])
     ORDER BY (lower(a."AccusedName") = $4) DESC, a."AccusedMasterID"
     LIMIT $3`,
    seed.accusedId,
    patterns,
    limit,
    (seed.name ?? "").toLowerCase()
  );
  return rows.map(toRecord);
}

/**
 * Other `Accused` rows that plausibly describe the same human as the seed,
 * ranked. Nothing is merged and nothing is written — this returns a list of
 * candidates with the reasons attached.
 */
export async function findSamePerson(
  seed: { accusedId?: number | null; personId?: string | null },
  opts: IdentityOptions = {}
): Promise<IdentityResult | null> {
  const cfg = { ...DEFAULTS, ...opts };
  const db = scopedClient(opts.districtId ?? null);

  const seedRecord = await fetchSeed(db, seed);
  if (!seedRecord) return null;

  const pool = await fetchCandidates(db, seedRecord, cfg.candidateLimit);
  const candidates = pool
    .map((r) => scoreAgainst(seedRecord, r))
    .filter((c) => c.confidence >= cfg.minConfidence)
    .sort((a, b) => b.confidence - a.confidence || a.accusedId - b.accusedId)
    .slice(0, cfg.limit);

  return { seed: seedRecord, candidates, considered: pool.length };
}

// ---- evaluation against the ground truth -----------------------------------

export interface IdentityEvalOptions extends IdentityOptions {
  /** How many seed rows to sample. */
  sample?: number;
  /** Deterministic sampling, so a tuning run is comparable to the last one. */
  seedOffset?: number;
  /**
   * Rewrite each candidate's name and age the way a real register mangles them
   * (initials, honorifics, spelling drift, estimated ages) before scoring. The
   * synthetic corpus repeats a person's name and age byte-for-byte across every
   * file, which flatters any matcher; this is the pessimistic reading.
   */
  perturb?: boolean;
}

export interface IdentityEvalExample {
  seed: string;
  seedAccusedId: number;
  truePositives: number;
  falsePositives: number;
  missed: number;
  topCandidates: { name: string | null; age: number | null; confidence: number; correct: boolean | null }[];
}

export interface IdentityEval {
  sample: number;
  /** Pairs the scorer asserted. */
  predicted: number;
  /** Pairs that PersonID confirms. */
  truePositives: number;
  falsePositives: number;
  /** True pairs the scorer did not assert, including any the prefilter missed. */
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  /** Precision of the naive baseline: identical name, nothing else. */
  namePrecision: number;
  nameRecall: number;
  examples: IdentityEvalExample[];
}

// Register noise, applied to a copy of the candidate row so the evaluation can
// answer "what happens when the two clerks do not agree?" — which is the only
// interesting question, and the one this corpus cannot ask by itself.
function perturbRecord(r: AccusedRecord, salt: number): AccusedRecord {
  const tokens = (r.name ?? "").trim().split(/\s+/).filter(Boolean);
  let name = r.name;
  const mode = salt % 4;
  if (tokens.length >= 2) {
    if (mode === 0) name = `${tokens[0][0]}. ${tokens.slice(1).join(" ")}`; // "Ravi Kumar" → "R. Kumar"
    else if (mode === 1) name = `Sri ${tokens.join(" ")}`;
    else if (mode === 2) name = `${tokens.join(" ")} S/o Nanjappa`;
    else name = tokens.map((t, i) => (i === tokens.length - 1 ? t.replace(/y$/i, "i") : t)).join(" ");
  }
  // Estimated ages drift by a year or two either side of the truth.
  const drift = (salt % 5) - 2;
  return { ...r, name, age: r.age == null ? null : r.age + drift };
}

/**
 * How much of the PersonID-backed behaviour survives without PersonID.
 *
 * Pairwise precision/recall over a sample of seed rows: a predicted pair is one
 * this scorer put at or above the threshold, a true pair is one where PersonID
 * agrees. Recall is measured against EVERY other row carrying the seed's
 * PersonID, not just the ones the prefilter happened to return, so a candidate
 * generation miss is counted as a miss rather than hidden.
 */
export async function evaluateIdentity(opts: IdentityEvalOptions = {}): Promise<IdentityEval> {
  const cfg = { ...DEFAULTS, sample: 200, seedOffset: 0, perturb: false, ...opts };
  const db = scopedClient(opts.districtId ?? null);

  // Sample from people who actually appear more than once — a seed with no true
  // partner can only ever contribute false positives, and a corpus-wide sample
  // would be mostly those, which would make recall meaningless.
  const seeds = await db.$queryRawUnsafe<Row[]>(
    `${SELECT}
     WHERE a."PersonID" IN (
       SELECT "PersonID" FROM "Accused" WHERE "PersonID" IS NOT NULL
       GROUP BY "PersonID" HAVING COUNT(*) > 1
     )
     ORDER BY a."AccusedMasterID"
     OFFSET $1 LIMIT $2`,
    cfg.seedOffset,
    cfg.sample
  );

  let predicted = 0, truePositives = 0, falsePositives = 0, falseNegatives = 0;
  let namePredicted = 0, nameTrue = 0, nameMissed = 0;
  const examples: IdentityEvalExample[] = [];

  for (const raw of seeds) {
    const seed = toRecord(raw);
    const pool = (await fetchCandidates(db, seed, cfg.candidateLimit)).map((r, i) =>
      cfg.perturb ? perturbRecord(r, r.accusedId + i) : r
    );

    // Ground truth: everything else this PersonID is on, whether or not the
    // prefilter found it. Counted from the same scoped client, so the number
    // never includes rows the caller could not have seen anyway.
    const truthRows = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n FROM "Accused" a
       JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID"
       WHERE a."PersonID" = $1 AND a."AccusedMasterID" <> $2`,
      seed.personId,
      seed.accusedId
    );
    const truePairs = truthRows[0]?.n ?? 0;

    const scored = pool.map((r) => scoreAgainst(seed, r));
    const hits = scored.filter((c) => c.confidence >= cfg.minConfidence);
    const tp = hits.filter((c) => c.personIdAgrees === true).length;
    predicted += hits.length;
    truePositives += tp;
    falsePositives += hits.length - tp;
    falseNegatives += Math.max(0, truePairs - tp);

    // Baseline: cluster on the written name alone, which is what a matcher
    // without any of this would do.
    const nameHits = pool.filter(
      (r) => normaliseName(r.name ?? "") === normaliseName(seed.name ?? "") && normaliseName(seed.name ?? "") !== ""
    );
    const nameTp = nameHits.filter((r) => r.personId && r.personId === seed.personId).length;
    namePredicted += nameHits.length;
    nameTrue += nameTp;
    nameMissed += Math.max(0, truePairs - nameTp);

    if (examples.length < 5) {
      examples.push({
        seed: seed.name ?? String(seed.accusedId),
        seedAccusedId: seed.accusedId,
        truePositives: tp,
        falsePositives: hits.length - tp,
        missed: Math.max(0, truePairs - tp),
        topCandidates: hits
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 4)
          .map((c) => ({ name: c.name, age: c.age, confidence: c.confidence, correct: c.personIdAgrees })),
      });
    }
  }

  const ratio = (a: number, b: number) => (b === 0 ? 0 : Number((a / b).toFixed(4)));
  const precision = ratio(truePositives, predicted);
  const recall = ratio(truePositives, truePositives + falseNegatives);
  return {
    sample: seeds.length,
    predicted,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : Number(((2 * precision * recall) / (precision + recall)).toFixed(4)),
    namePrecision: ratio(nameTrue, namePredicted),
    nameRecall: ratio(nameTrue, nameTrue + nameMissed),
    examples,
  };
}
