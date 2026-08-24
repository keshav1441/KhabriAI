import { scopedClient, type Db } from "./db";

/**
 * Crew dossier — the multi-hop version of MO linking.
 *
 * A single MO link answers "what else looks like this?". An investigation needs
 * the next question: who is behind the series, where has it run, and what is
 * already done about it. This walks outward from one case (or one person) along
 * two kinds of edge — people who were charged in the same FIR, and narratives
 * that describe the same method — and returns the connected component as a
 * briefing: members, the case timeline, the districts it crosses, the recurring
 * details in the narratives, and what stage each case is at.
 *
 * Every case carries how it was reached (`link`), so nothing in the dossier is
 * an unexplained assertion: a co-accused link is a fact from the FIR, an MO
 * link is a similarity score the officer can judge.
 *
 * Runs entirely inside the caller's scope — an SHO's dossier is built from the
 * cases row-level security lets them see, so the walk cannot leak another
 * district's file.
 */

export interface CrewMember {
  personId: string;
  name: string;
  age: number | null;
  gender: string | null;
  /** Cases inside this dossier they are named in. */
  casesInCrew: number;
  /** Every case they are named in, dossier or not. */
  totalCases: number;
  districts: string[];
  arrests: number;
}

export type CrewLink = "seed" | "co-accused" | "mo";

export interface CrewCase {
  id: number;
  crimeNo: string;
  date: string | null;
  district: string | null;
  station: string | null;
  crimeType: string | null;
  crimeGroup: string | null;
  status: string | null;
  briefFacts: string | null;
  arrested: boolean;
  chargesheeted: boolean;
  /** How this case entered the dossier. */
  link: CrewLink;
  /** For an MO link: the case it was matched against, and the cosine score. */
  linkedFrom?: number;
  linkScore?: number;
}

export interface CrewEdge {
  source: string;
  target: string;
  /** Cases the two are named in together. */
  weight: number;
}

export interface CrewMoLink {
  from: number;
  to: number;
  score: number;
  crossDistrict: boolean;
}

export interface CrewDossier {
  seed: { caseId: number | null; personId: string | null; label: string };
  members: CrewMember[];
  cases: CrewCase[];
  districts: string[];
  crossDistrict: boolean;
  /** Details repeated across the narratives — the crew's signature, in their own FIRs' words. */
  signature: string[];
  edges: CrewEdge[];
  moLinks: CrewMoLink[];
  summary: {
    cases: number;
    members: number;
    districts: number;
    arrested: number;
    chargesheeted: number;
    open: number;
    first: string | null;
    last: string | null;
  };
  /** True when a cap stopped the walk — the real component is larger. */
  truncated: boolean;
}

export interface CrewOptions {
  hops?: number;
  maxCases?: number;
  maxMembers?: number;
  /** Minimum cosine similarity for a narrative to count as the same method. */
  moMinScore?: number;
  moTopK?: number;
  districtId?: number | null;
}

const DEFAULTS = {
  hops: 2,
  maxCases: 40,
  maxMembers: 25,
  moMinScore: Number(process.env.CREW_MO_MIN_SCORE ?? 0.78),
  moTopK: 4,
};

// ---- graph walk -------------------------------------------------------------

async function personsInCases(db: Db, caseIds: number[]) {
  if (!caseIds.length) return [];
  return db.$queryRawUnsafe<{ person_id: string; case_id: number }[]>(
    `SELECT DISTINCT a."PersonID" AS person_id, a."CaseMasterID" AS case_id
     FROM "Accused" a
     WHERE a."CaseMasterID" = ANY($1::int[]) AND a."PersonID" IS NOT NULL`,
    caseIds
  );
}

/**
 * A co-offender's other cases, restricted to the crime groups the seed is
 * about. Without that restriction a prolific offender drags in every accident
 * and dowry case they were ever named in, and the dossier stops describing a
 * series and starts describing a person's whole record.
 */
async function casesOfPersons(db: Db, personIds: string[], groupIds: number[] | null = null) {
  if (!personIds.length) return [];
  const filter = groupIds?.length ? `AND cm."CrimeMajorHeadID" = ANY($2::int[])` : "";
  return db.$queryRawUnsafe<{ person_id: string; case_id: number; date: Date | null }[]>(
    `SELECT DISTINCT a."PersonID" AS person_id, a."CaseMasterID" AS case_id, cm."CrimeRegisteredDate" AS date
     FROM "Accused" a
     JOIN "CaseMaster" cm ON cm."CaseMasterID" = a."CaseMasterID"
     WHERE a."PersonID" = ANY($1::text[]) ${filter}`,
    ...(groupIds?.length ? [personIds, groupIds] : [personIds])
  );
}

/** The crime groups the walk should stay inside — taken from the seed cases. */
async function groupsOfCases(db: Db, caseIds: number[]): Promise<number[]> {
  if (!caseIds.length) return [];
  const rows = await db.$queryRawUnsafe<{ g: number }[]>(
    `SELECT DISTINCT "CrimeMajorHeadID" AS g FROM "CaseMaster"
     WHERE "CaseMasterID" = ANY($1::int[]) AND "CrimeMajorHeadID" IS NOT NULL`,
    caseIds
  );
  return rows.map((r) => r.g);
}

/** Nearest narratives for each case in the frontier, in one indexed pass. */
async function moNeighbours(db: Db, caseIds: number[], topK: number, minScore: number) {
  if (!caseIds.length) return [];
  return db.$queryRawUnsafe<{ from_id: number; to_id: number; score: number }[]>(
    `WITH src AS (
       SELECT "CaseMasterID" AS id, "BriefFactsEmbedding" AS e
       FROM "CaseMaster"
       WHERE "CaseMasterID" = ANY($1::int[]) AND "BriefFactsEmbedding" IS NOT NULL
     )
     SELECT s.id AS from_id, m.id AS to_id, m.score
     FROM src s
     CROSS JOIN LATERAL (
       SELECT cm."CaseMasterID" AS id, 1 - (cm."BriefFactsEmbedding" <=> s.e) AS score
       FROM "CaseMaster" cm
       WHERE cm."BriefFactsEmbedding" IS NOT NULL AND cm."CaseMasterID" <> s.id
       ORDER BY cm."BriefFactsEmbedding" <=> s.e
       LIMIT $2
     ) m
     WHERE m.score >= $3`,
    caseIds,
    topK,
    minScore
  );
}

// ---- detail fetches ---------------------------------------------------------

type CaseRow = {
  id: number; crime_no: string | null; date: Date | null; district: string | null; station: string | null;
  crime_type: string | null; crime_group: string | null; status: string | null; brief_facts: string | null;
  arrested: boolean; chargesheeted: boolean;
};

async function caseDetails(db: Db, caseIds: number[]): Promise<CaseRow[]> {
  if (!caseIds.length) return [];
  return db.$queryRawUnsafe<CaseRow[]>(
    `SELECT cm."CaseMasterID" AS id, cm."CrimeNo" AS crime_no, cm."CrimeRegisteredDate" AS date,
            d."DistrictName" AS district, u."UnitName" AS station,
            csh."CrimeHeadName" AS crime_type, ch."CrimeGroupName" AS crime_group,
            cs."CaseStatusName" AS status, cm."BriefFacts" AS brief_facts,
            EXISTS (SELECT 1 FROM "ArrestSurrender" ar WHERE ar."CaseMasterID" = cm."CaseMasterID") AS arrested,
            EXISTS (SELECT 1 FROM "ChargesheetDetails" cd WHERE cd."CaseMasterID" = cm."CaseMasterID") AS chargesheeted
     FROM "CaseMaster" cm
     LEFT JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
     LEFT JOIN "District" d ON d."DistrictID" = u."DistrictID"
     LEFT JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
     LEFT JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
     LEFT JOIN "CaseStatusMaster" cs ON cs."CaseStatusID" = cm."CaseStatusID"
     WHERE cm."CaseMasterID" = ANY($1::int[])
     ORDER BY cm."CrimeRegisteredDate" ASC NULLS LAST`,
    caseIds
  );
}

type MemberRow = {
  person_id: string; name: string | null; age: number | null; gender_id: number | null;
  total_cases: number; arrests: number;
};

async function memberDetails(db: Db, personIds: string[]): Promise<MemberRow[]> {
  if (!personIds.length) return [];
  return db.$queryRawUnsafe<MemberRow[]>(
    `SELECT a."PersonID" AS person_id,
            MAX(a."AccusedName") AS name,
            MAX(a."AgeYear")     AS age,
            MAX(a."GenderID")    AS gender_id,
            COUNT(DISTINCT a."CaseMasterID")::int AS total_cases,
            COUNT(DISTINCT ar."ArrestSurrenderID")::int AS arrests
     FROM "Accused" a
     LEFT JOIN "ArrestSurrender" ar
            ON ar."AccusedMasterID" = a."AccusedMasterID" AND ar."IsAccused" = true
     WHERE a."PersonID" = ANY($1::text[])
     GROUP BY a."PersonID"`,
    personIds
  );
}

// ---- signature --------------------------------------------------------------

const STOP = new Set(
  "the a an and or of in on at to for with was were is are by from that this it as had has been which who when after before during about".split(" ")
);

/**
 * The details the narratives keep repeating. Counts word shingles across the
 * dossier's brief facts and keeps the ones that recur in several separate
 * files — a phrase in one FIR is a detail, the same phrase in four is a habit.
 */
export function extractSignature(narratives: string[], minCases = 2, max = 6): string[] {
  // Shingle inside a clause, never across one: a phrase that spans a full stop
  // ("number plate. cut the cctv cable") is an artefact of two details sitting
  // next to each other, not a detail of its own.
  const texts = narratives
    .filter(Boolean)
    .map((n) => n.toLowerCase().split(/[.;,!?]+/).map((c) => c.replace(/[^a-z0-9\s]/g, " ").trim()).filter(Boolean));
  if (texts.length < 2) return [];
  const threshold = Math.max(minCases, Math.ceil(texts.length * 0.3));

  const seenIn = new Map<string, Set<number>>();
  texts.forEach((clauses, i) => {
    const words = clauses.flatMap((c) => [...c.split(/\s+/).filter(Boolean), " "]);
    // Long shingles first: the full trait sentence ("two men on a black pulsar
    // without a number plate") contains its own fragments, so keeping the
    // longest match that still recurs collapses the fragments automatically.
    for (let n = 12; n >= 4; n--) {
      for (let s = 0; s + n <= words.length; s++) {
        const gram = words.slice(s, s + n);
        if (gram.includes(" ")) continue; // clause boundary
        // Skip filler-only runs — they recur everywhere and say nothing.
        if (gram.filter((w) => !STOP.has(w) && w.length > 2).length < n / 2) continue;
        const key = gram.join(" ");
        (seenIn.get(key) ?? seenIn.set(key, new Set()).get(key)!).add(i);
      }
    }
  });

  const ranked = [...seenIn.entries()]
    .filter(([, cases]) => cases.size >= threshold)
    // Longest first among equally common phrases, so the fullest wording of a
    // detail is the one that survives deduping.
    .sort((a, b) => b[0].split(" ").length - a[0].split(" ").length || b[1].size - a[1].size);

  // Shingles of the same sentence overlap heavily ("a black pulsar without" /
  // "black pulsar without a"). Keep one form of each detail.
  const kept: string[] = [];
  const overlaps = (a: string, b: string) => {
    if (a.includes(b) || b.includes(a)) return true;
    const wa = new Set(a.split(" "));
    const shared = b.split(" ").filter((w) => wa.has(w)).length;
    return shared / Math.min(wa.size, b.split(" ").length) >= 0.6;
  };
  for (const [phrase] of ranked) {
    if (kept.some((k) => overlaps(k, phrase))) continue;
    kept.push(phrase);
    if (kept.length === max) break;
  }
  return kept;
}

// ---- assembly ---------------------------------------------------------------

function genderOf(id: number | null): string | null {
  return id === 1 ? "Male" : id === 2 ? "Female" : id ? "Transgender" : null;
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function buildCrew(
  seed: { caseId?: number | null; personId?: string | null },
  opts: CrewOptions = {}
): Promise<CrewDossier> {
  const cfg = { ...DEFAULTS, ...opts };
  const db = scopedClient(opts.districtId ?? null);

  // Where the walk starts.
  let seedCaseIds: number[] = [];
  if (seed.caseId) seedCaseIds = [seed.caseId];
  else if (seed.personId) {
    const rows = await casesOfPersons(db, [seed.personId]);
    seedCaseIds = rows.map((r) => r.case_id);
  }
  if (!seedCaseIds.length) {
    return emptyDossier(seed);
  }

  const caseLink = new Map<number, { link: CrewLink; from?: number; score?: number }>();
  for (const id of seedCaseIds) caseLink.set(id, { link: "seed" });
  const members = new Set<string>();
  const moLinks: CrewMoLink[] = [];
  const membership: { person: string; case: number }[] = [];
  let truncated = false;

  // Everything the walk pulls in has to belong to the same kind of offending as
  // the seed, otherwise the cap fills with noise before the real series is in.
  const focusGroups = await groupsOfCases(db, seedCaseIds);

  let frontier = [...seedCaseIds];
  for (let hop = 0; hop < cfg.hops && frontier.length; hop++) {
    // Edge 1 — charged in the same FIR. A fact, not an inference.
    const inCases = await personsInCases(db, frontier);
    membership.push(...inCases.map((r) => ({ person: r.person_id, case: r.case_id })));
    const newPersons: string[] = [];
    for (const r of inCases) {
      if (members.has(r.person_id)) continue;
      if (members.size >= cfg.maxMembers) { truncated = true; break; }
      members.add(r.person_id);
      newPersons.push(r.person_id);
    }

    // Edge 2 — the same method described in another file. Only followed from
    // cases that are themselves on the method chain (the seed, or an earlier MO
    // hit). Chasing narratives from every co-offender's case instead turns a
    // series into a survey of the whole state.
    const methodChain = frontier.filter((id) => {
      const link = caseLink.get(id)?.link;
      return link === "seed" || link === "mo";
    });
    const mo = await moNeighbours(db, methodChain, cfg.moTopK, cfg.moMinScore);

    const theirCases = await casesOfPersons(db, newPersons, focusGroups);
    membership.push(...theirCases.map((r) => ({ person: r.person_id, case: r.case_id })));

    const next: number[] = [];
    const addCase = (id: number, entry: { link: CrewLink; from?: number; score?: number }) => {
      if (caseLink.has(id)) return false;
      if (caseLink.size >= cfg.maxCases) { truncated = true; return false; }
      caseLink.set(id, entry);
      next.push(id);
      return true;
    };

    // The cap is a budget, so spend it on the strongest evidence first: a
    // narrative match with a score, then co-offence, newest first.
    for (const m of [...mo].sort((a, b) => b.score - a.score)) {
      if (addCase(m.to_id, { link: "mo", from: m.from_id, score: m.score })) {
        moLinks.push({ from: m.from_id, to: m.to_id, score: m.score, crossDistrict: false });
      } else if (caseLink.get(m.to_id)) {
        // Already in by another route — still worth drawing the edge.
        moLinks.push({ from: m.from_id, to: m.to_id, score: m.score, crossDistrict: false });
      }
    }
    const byRecency = [...theirCases].sort(
      (a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0)
    );
    for (const r of byRecency) addCase(r.case_id, { link: "co-accused" });
    frontier = next;
  }

  // Anyone named in a case the walk pulled in is part of the picture.
  const finalCaseIds = [...caseLink.keys()];
  const allInCases = await personsInCases(db, finalCaseIds);
  membership.push(...allInCases.map((r) => ({ person: r.person_id, case: r.case_id })));
  for (const r of allInCases) {
    if (members.size >= cfg.maxMembers) { truncated = true; break; }
    members.add(r.person_id);
  }

  const [caseRows, memberRows] = await Promise.all([
    caseDetails(db, finalCaseIds),
    memberDetails(db, [...members]),
  ]);

  const districtOfCase = new Map(caseRows.map((c) => [c.id, c.district]));
  for (const l of moLinks) {
    const a = districtOfCase.get(l.from);
    const b = districtOfCase.get(l.to);
    l.crossDistrict = Boolean(a && b && a !== b);
  }

  const cases: CrewCase[] = caseRows.map((c) => {
    const meta = caseLink.get(c.id)!;
    return {
      id: c.id,
      crimeNo: c.crime_no ?? String(c.id),
      date: iso(c.date),
      district: c.district,
      station: c.station,
      crimeType: c.crime_type,
      crimeGroup: c.crime_group,
      status: c.status,
      briefFacts: c.brief_facts,
      arrested: c.arrested,
      chargesheeted: c.chargesheeted,
      link: meta.link,
      ...(meta.from ? { linkedFrom: meta.from } : {}),
      ...(meta.score ? { linkScore: Number(meta.score.toFixed(3)) } : {}),
    };
  });

  // Per-member counts, restricted to the dossier's own cases.
  const inCrew = new Map<string, Set<number>>();
  const memberDistricts = new Map<string, Set<string>>();
  const caseIdSet = new Set(finalCaseIds);
  for (const m of membership) {
    if (!caseIdSet.has(m.case)) continue;
    (inCrew.get(m.person) ?? inCrew.set(m.person, new Set()).get(m.person)!).add(m.case);
    const d = districtOfCase.get(m.case);
    if (d) (memberDistricts.get(m.person) ?? memberDistricts.set(m.person, new Set()).get(m.person)!).add(d);
  }

  const memberList: CrewMember[] = memberRows
    .map((m) => ({
      personId: m.person_id,
      name: m.name ?? m.person_id,
      age: m.age,
      gender: genderOf(m.gender_id),
      casesInCrew: inCrew.get(m.person_id)?.size ?? 0,
      totalCases: Number(m.total_cases),
      districts: [...(memberDistricts.get(m.person_id) ?? [])].sort(),
      arrests: Number(m.arrests),
    }))
    .sort((a, b) => b.casesInCrew - a.casesInCrew || b.totalCases - a.totalCases);

  // Person-to-person edges: how many of the dossier's cases name both.
  const edgeWeight = new Map<string, number>();
  const byCase = new Map<number, string[]>();
  for (const m of membership) {
    if (!caseIdSet.has(m.case)) continue;
    const list = byCase.get(m.case) ?? byCase.set(m.case, []).get(m.case)!;
    if (!list.includes(m.person)) list.push(m.person);
  }
  for (const people of byCase.values()) {
    const sorted = [...people].sort();
    for (let i = 0; i < sorted.length; i++)
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}|${sorted[j]}`;
        edgeWeight.set(key, (edgeWeight.get(key) ?? 0) + 1);
      }
  }
  const edges: CrewEdge[] = [...edgeWeight.entries()].map(([key, weight]) => {
    const [source, target] = key.split("|");
    return { source, target, weight };
  });

  const districts = [...new Set(cases.map((c) => c.district).filter((d): d is string => Boolean(d)))].sort();
  const dated = cases.map((c) => c.date).filter((d): d is string => Boolean(d)).sort();

  return {
    seed: {
      caseId: seed.caseId ?? null,
      personId: seed.personId ?? null,
      label: seed.caseId
        ? `FIR ${cases.find((c) => c.id === seed.caseId)?.crimeNo ?? seed.caseId}`
        : memberList.find((m) => m.personId === seed.personId)?.name ?? String(seed.personId),
    },
    members: memberList,
    cases,
    districts,
    crossDistrict: districts.length > 1,
    signature: extractSignature(cases.map((c) => c.briefFacts ?? "")),
    edges,
    moLinks,
    summary: {
      cases: cases.length,
      members: memberList.length,
      districts: districts.length,
      arrested: cases.filter((c) => c.arrested).length,
      chargesheeted: cases.filter((c) => c.chargesheeted).length,
      open: cases.filter((c) => !c.chargesheeted).length,
      first: dated[0] ?? null,
      last: dated[dated.length - 1] ?? null,
    },
    truncated,
  };
}

function emptyDossier(seed: { caseId?: number | null; personId?: string | null }): CrewDossier {
  return {
    seed: { caseId: seed.caseId ?? null, personId: seed.personId ?? null, label: "" },
    members: [], cases: [], districts: [], crossDistrict: false, signature: [], edges: [], moLinks: [],
    summary: { cases: 0, members: 0, districts: 0, arrested: 0, chargesheeted: 0, open: 0, first: null, last: null },
    truncated: false,
  };
}
