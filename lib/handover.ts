import { scopedClient, type Db } from "./db";
import { chargesheetClock, daysSince, type ChargesheetClock } from "./pendency";
import { buildCrew } from "./crew";
import { similarCasesTo } from "./case-retrieval";
import { findDuplicatesOf, type DuplicateReason } from "./duplicate-detect";

/**
 * The case handover brief — what an investigating officer needs when a case
 * changes hands.
 *
 * When an IO is transferred, the next officer reconstructs the file by hand:
 * reading the FIR, counting who was arrested, working out how many days are
 * left on the chargesheet clock, and — if they are thorough and lucky —
 * discovering months later that the same crew is being worked two districts
 * away. All of that is already in this database and in features this app has
 * built. This assembles it into one document.
 *
 * NOTHING HERE IS WRITTEN BY A MODEL. Every sentence is a field, a count or a
 * date read off the record, or a fixed label chosen by a rule you can read
 * below. This is a legal handover document: a hallucinated sentence in it — an
 * arrest that did not happen, a deadline that is not the deadline — is far
 * worse than a plain one, because the officer who receives it has no way to
 * tell the invented line from the true ones. So the brief is assembled, never
 * generated, and where the record is silent it says so instead of filling in.
 *
 * Scope-aware exactly like the crew walk: every query runs through
 * scopedClient(), so a district-posted officer's brief is built only from the
 * files RLS lets them read.
 */

// ---- what is outstanding ---------------------------------------------------

export type OutstandingKind =
  | "chargesheet"
  | "accusedAtLarge"
  | "sections"
  | "narrative"
  | "none";

export interface OutstandingItem {
  kind: OutstandingKind;
  /** Plain English, assembled from the numbers — never a generated sentence. */
  label: string;
  /** "urgent" is reserved for a statutory limit already passed. */
  severity: "urgent" | "open" | "note";
}

export interface Outstanding {
  items: OutstandingItem[];
  /** True when the record shows nothing left to do. */
  clear: boolean;
}

/** The facts the derivation needs — all of them already read off the record. */
export interface OutstandingInput {
  chargesheetFiled: boolean;
  /** The statutory clock, or null when there is no FIR date to run one from. */
  clock: ChargesheetClock | null;
  /** Accused named in the FIR with no arrest or surrender recorded against them. */
  accusedAtLarge: string[];
  /** Rows in ActSectionAssociation. */
  sectionCount: number;
  /** BriefFacts present and not blank. */
  hasNarrative: boolean;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Pure derivation of the "what is outstanding" section — no database, no clock
 * of its own, so the rules can be tested and argued with directly (see
 * test/handover.test.ts).
 *
 * Two rules worth stating out loud:
 *
 *  - A chargesheeted case gets NO chargesheet deadline. The clock exists to
 *    warn about default bail under BNSS s.187(3); once the chargesheet is
 *    filed the limit has been met and printing a countdown next to it would be
 *    telling the incoming officer to chase something already done.
 *  - An empty list is reported as an explicit "nothing outstanding", never as a
 *    blank heading. A blank section in a handover reads as "not filled in",
 *    which is the opposite of what it means.
 */
export function deriveOutstanding(input: OutstandingInput): Outstanding {
  const items: OutstandingItem[] = [];

  if (!input.chargesheetFiled && input.clock) {
    const c = input.clock;
    items.push(
      c.state === "overdue"
        ? {
            kind: "chargesheet",
            severity: "urgent",
            label: `Chargesheet overdue by ${c.daysOverdue} ${plural(c.daysOverdue, "day", "days")} — the ${c.limitDays}-day limit has passed.`,
          }
        : {
            kind: "chargesheet",
            severity: "open",
            label: `Chargesheet not filed — ${c.daysRemaining} ${plural(c.daysRemaining, "day", "days")} left of the ${c.limitDays}-day limit.`,
          }
    );
  } else if (!input.chargesheetFiled) {
    // No registration date, so no clock. Say that rather than assume a day zero.
    items.push({
      kind: "chargesheet",
      severity: "open",
      label: "Chargesheet not filed. No registration date on the file, so no statutory clock can be run.",
    });
  }

  if (input.accusedAtLarge.length) {
    items.push({
      kind: "accusedAtLarge",
      severity: "open",
      label: `${input.accusedAtLarge.length} ${plural(input.accusedAtLarge.length, "accused", "accused")} named but never brought in — ${input.accusedAtLarge.join(", ")}.`,
    });
  }

  if (input.sectionCount === 0) {
    items.push({
      kind: "sections",
      severity: "open",
      label: "No act or sections recorded against the case.",
    });
  }

  if (!input.hasNarrative) {
    items.push({
      kind: "narrative",
      severity: "open",
      label: "No brief facts recorded — the file carries no narrative of the offence.",
    });
  }

  if (!items.length) {
    return {
      clear: true,
      items: [{ kind: "none", severity: "note", label: "Nothing outstanding on the record." }],
    };
  }
  return { clear: false, items };
}

// ---- the brief -------------------------------------------------------------

export interface HandoverPerson {
  name: string;
  age: number | null;
  gender: string | null;
}

export interface HandoverArrest {
  name: string | null;
  date: string | null;
  district: string | null;
}

export interface HandoverChargesheet {
  date: string | null;
  type: string | null;
  filedBy: string | null;
}

export interface HandoverLinkedCase {
  id: number;
  crimeNo: string | null;
  date: string | null;
  district: string | null;
  station: string | null;
  crimeType: string | null;
  status: string | null;
  /** Why this case is on the list, in the words of the feature that found it. */
  why: string;
}

export interface HandoverDuplicate extends HandoverLinkedCase {
  likelihood: number;
  reasons: DuplicateReason[];
}

export interface HandoverBrief {
  caseId: number;
  crimeNo: string | null;
  caseNo: string | null;
  registered: string | null;
  station: string | null;
  district: string | null;
  status: string | null;
  gravity: string | null;
  crimeGroup: string | null;
  crimeType: string | null;
  category: string | null;
  court: string | null;
  officer: string | null;

  whatHappened: {
    narrative: string | null;
    sections: { act: string; section: string; description: string | null }[];
    complainants: HandoverPerson[];
    victims: HandoverPerson[];
    accused: HandoverPerson[];
  };

  doneSoFar: {
    arrests: HandoverArrest[];
    chargesheets: HandoverChargesheet[];
    chargesheetFiled: boolean;
  };

  clock: ChargesheetClock | null;
  daysSinceFir: number | null;
  outstanding: Outstanding;

  linked: {
    /** Narratives describing the same method (lib/case-retrieval). */
    moMatches: HandoverLinkedCase[];
    /** The crew walk's other cases, and who ties them together (lib/crew). */
    crew: { members: { name: string; casesInCrew: number; totalCases: number }[]; cases: HandoverLinkedCase[] } | null;
    /**
     * Probable re-filings of the SAME incident (lib/duplicate-detect).
     *
     * Included deliberately. A duplicate is a live decision sitting on the
     * file — one of the two FIRs has to be closed, or the two investigations
     * merged — and it is exactly the decision that gets lost at a handover:
     * the outgoing officer knew, the incoming one has no way to find out. It
     * is presented as a flag with its likelihood and its reasons, never as a
     * finding, so nobody closes a file on the strength of this brief.
     */
    duplicates: HandoverDuplicate[];
  };

  generatedAt: string;
}

const CSTYPE: Record<string, string> = { A: "Chargesheet Filed", B: "False Case", C: "Undetected" };
const iso = (d: unknown) => (d ? new Date(d as string).toISOString().slice(0, 10) : null);
const genderOf = (id: unknown) => (id === 1 ? "Male" : id === 2 ? "Female" : id ? "Transgender" : null);

type CaseRow = {
  case_id: number; crime_no: string | null; case_no: string | null; registered: Date | null;
  brief_facts: string | null; station: string | null; district: string | null;
  crime_group: string | null; crime_type: string | null; status: string | null;
  category: string | null; gravity: string | null; officer: string | null; court: string | null;
};
type PersonRow = { name: string | null; age: number | null; gender_id: number | null };
type AccusedRow = PersonRow & { accused_id: number; arrested: boolean };
type ArrestRow = { name: string | null; date: Date | null; district: string | null };
type CsRow = { date: Date | null; type: string | null; filed_by: string | null };
type SectionRow = { act: string; section: string; description: string | null };

const person = (r: PersonRow): HandoverPerson => ({
  name: r.name ?? "—",
  age: r.age == null ? null : Number(r.age),
  gender: genderOf(r.gender_id),
});

/**
 * Assemble the brief for one case.
 *
 * The core read is the same shape as /api/case's case-detail query — the
 * drawer and the brief must never disagree about who is on a file — extended
 * with the complainant (the drawer omits them; a handover cannot) and with an
 * arrested flag per accused, which is what the "never brought in" line needs.
 *
 * The three linked-case sections are independent and each is allowed to fail
 * on its own: they lean on embeddings and on a multi-hop walk, and a brief
 * without its MO matches is still a usable handover, while a 500 is not.
 */
export async function buildHandover(
  caseId: number,
  { districtId = null, now = new Date() }: { districtId?: number | null; now?: Date } = {}
): Promise<HandoverBrief | null> {
  const db: Db = scopedClient(districtId);

  const [caseRows, complainants, victims, accused, arrests, chargesheets, sections] = await Promise.all([
    db.$queryRawUnsafe<CaseRow[]>(
      `SELECT cm."CaseMasterID" AS case_id, cm."CrimeNo" AS crime_no, cm."CaseNo" AS case_no,
              cm."CrimeRegisteredDate" AS registered, cm."BriefFacts" AS brief_facts,
              u."UnitName" AS station, d."DistrictName" AS district,
              ch."CrimeGroupName" AS crime_group, csh."CrimeHeadName" AS crime_type,
              cs."CaseStatusName" AS status, cat."LookupValue" AS category,
              go."LookupValue" AS gravity, e."FirstName" AS officer, ct."CourtName" AS court
       FROM "CaseMaster" cm
       LEFT JOIN "Unit" u ON u."UnitID" = cm."PoliceStationID"
       LEFT JOIN "District" d ON d."DistrictID" = u."DistrictID"
       LEFT JOIN "CrimeHead" ch ON ch."CrimeHeadID" = cm."CrimeMajorHeadID"
       LEFT JOIN "CrimeSubHead" csh ON csh."CrimeSubHeadID" = cm."CrimeMinorHeadID"
       LEFT JOIN "CaseStatusMaster" cs ON cs."CaseStatusID" = cm."CaseStatusID"
       LEFT JOIN "CaseCategory" cat ON cat."CaseCategoryID" = cm."CaseCategoryID"
       LEFT JOIN "GravityOffence" go ON go."GravityOffenceID" = cm."GravityOffenceID"
       LEFT JOIN "Employee" e ON e."EmployeeID" = cm."PolicePersonID"
       LEFT JOIN "Court" ct ON ct."CourtID" = cm."CourtID"
       WHERE cm."CaseMasterID" = $1
       LIMIT 1`,
      caseId
    ),
    db.$queryRawUnsafe<PersonRow[]>(
      `SELECT "ComplainantName" AS name, "AgeYear" AS age, "GenderID" AS gender_id
       FROM "ComplainantDetails" WHERE "CaseMasterID" = $1`,
      caseId
    ),
    db.$queryRawUnsafe<PersonRow[]>(
      `SELECT "VictimName" AS name, "AgeYear" AS age, "GenderID" AS gender_id
       FROM "Victim" WHERE "CaseMasterID" = $1`,
      caseId
    ),
    // The arrested flag is decided per accused rather than by comparing counts:
    // three accused and two arrests does not tell you WHICH two.
    db.$queryRawUnsafe<AccusedRow[]>(
      `SELECT a."AccusedMasterID" AS accused_id, a."AccusedName" AS name, a."AgeYear" AS age,
              a."GenderID" AS gender_id,
              EXISTS (SELECT 1 FROM "ArrestSurrender" ar WHERE ar."AccusedMasterID" = a."AccusedMasterID") AS arrested
       FROM "Accused" a WHERE a."CaseMasterID" = $1`,
      caseId
    ),
    db.$queryRawUnsafe<ArrestRow[]>(
      `SELECT ar."ArrestSurrenderDate" AS date, a."AccusedName" AS name, d."DistrictName" AS district
       FROM "ArrestSurrender" ar
       LEFT JOIN "Accused" a ON a."AccusedMasterID" = ar."AccusedMasterID"
       LEFT JOIN "District" d ON d."DistrictID" = ar."ArrestSurrenderDistrictId"
       WHERE ar."CaseMasterID" = $1
       ORDER BY ar."ArrestSurrenderDate" ASC NULLS LAST`,
      caseId
    ),
    db.$queryRawUnsafe<CsRow[]>(
      `SELECT cd."csdate" AS date, cd."cstype" AS type, e."FirstName" AS filed_by
       FROM "ChargesheetDetails" cd
       LEFT JOIN "Employee" e ON e."EmployeeID" = cd."PolicePersonID"
       WHERE cd."CaseMasterID" = $1`,
      caseId
    ),
    db.$queryRawUnsafe<SectionRow[]>(
      `SELECT asa."ActCode" AS act, asa."SectionCode" AS section, s."SectionDescription" AS description
       FROM "ActSectionAssociation" asa
       LEFT JOIN "Section" s ON s."ActCode" = asa."ActCode" AND s."SectionCode" = asa."SectionCode"
       WHERE asa."CaseMasterID" = $1`,
      caseId
    ),
  ]);

  // Out of scope reads exactly like not existing — RLS returns no row, and the
  // route turns that into a 404 rather than telling the caller a case is there.
  const c = caseRows[0];
  if (!c) return null;

  const chargesheetFiled = chargesheets.length > 0;
  const daysSinceFir = c.registered ? daysSince(c.registered, now) : null;
  const clock = daysSinceFir == null ? null : chargesheetClock(daysSinceFir, c.gravity);
  const narrative = (c.brief_facts ?? "").trim() || null;

  const outstanding = deriveOutstanding({
    chargesheetFiled,
    clock,
    accusedAtLarge: accused.filter((a) => !a.arrested).map((a) => a.name ?? "unnamed accused"),
    sectionCount: sections.length,
    hasNarrative: Boolean(narrative),
  });

  const [moMatches, crew, duplicates] = await Promise.all([
    similarCasesTo(caseId, { topK: 5, minScore: 0.72, districtId }).catch(() => []),
    buildCrew({ caseId }, { districtId }).catch(() => null),
    findDuplicatesOf(caseId, { districtId }).catch(() => []),
  ]);

  return {
    caseId,
    crimeNo: c.crime_no,
    caseNo: c.case_no,
    registered: iso(c.registered),
    station: c.station,
    district: c.district,
    status: c.status,
    gravity: c.gravity,
    crimeGroup: c.crime_group,
    crimeType: c.crime_type,
    category: c.category,
    court: c.court,
    officer: c.officer,

    whatHappened: {
      narrative,
      sections: sections.map((s) => ({ act: s.act, section: s.section, description: s.description })),
      complainants: complainants.map(person),
      victims: victims.map(person),
      accused: accused.map(person),
    },

    doneSoFar: {
      arrests: arrests.map((a) => ({ name: a.name, date: iso(a.date), district: a.district })),
      chargesheets: chargesheets.map((cs) => ({
        date: iso(cs.date),
        type: cs.type ? (CSTYPE[cs.type] ?? cs.type) : null,
        filedBy: cs.filed_by,
      })),
      chargesheetFiled,
    },

    clock,
    daysSinceFir,
    outstanding,

    linked: {
      moMatches: moMatches.map((m) => ({
        id: m.id,
        crimeNo: m.crimeNo,
        date: m.registered ?? null,
        district: m.district,
        station: m.station ?? null,
        crimeType: m.crimeType ?? null,
        status: m.status ?? null,
        why: `Narrative ${Math.round(m.score * 100)}% alike${m.district && m.district !== c.district ? " — other district" : ""}`,
      })),
      crew: crew
        ? {
            members: crew.members
              .filter((m) => m.casesInCrew > 0)
              .slice(0, 10)
              .map((m) => ({ name: m.name, casesInCrew: m.casesInCrew, totalCases: m.totalCases })),
            // The seed is this case; a handover lists the OTHER files the walk reached.
            cases: crew.cases
              .filter((k) => k.id !== caseId)
              .map((k) => ({
                id: k.id,
                crimeNo: k.crimeNo,
                date: k.date,
                district: k.district,
                station: k.station,
                crimeType: k.crimeType,
                status: k.status,
                why:
                  k.link === "co-accused"
                    ? "Same accused named in both files"
                    : `Same method — ${Math.round((k.linkScore ?? 0) * 100)}% narrative match`,
              })),
          }
        : null,
      duplicates: duplicates.map((d) => ({
        id: d.id,
        crimeNo: d.crimeNo,
        date: d.registered,
        district: d.district,
        station: d.station,
        crimeType: d.crimeType,
        status: d.status,
        why: d.sameStation ? "Possible re-filing at the same station" : "Possible re-filing at another station",
        likelihood: d.likelihood,
        reasons: d.reasons,
      })),
    },

    generatedAt: now.toISOString(),
  };
}
