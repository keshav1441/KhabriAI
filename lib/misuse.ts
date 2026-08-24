import { prisma } from "./db";

/**
 * Misuse detection over the audit trail.
 *
 * "What stops an officer misusing this system?" is the question a police AI is
 * approved or rejected on, and until now this app had only half an answer: it
 * records who asked what under which scope, and nothing ever read it back. A
 * trail nobody reads is a filing cabinet, not a control. This module is the
 * part that reads it.
 *
 * Two things it is deliberately NOT:
 *
 *  - It is not a measure of officers' performance. Nothing here counts how much
 *    work an officer did, how fast, or how well. Every signal is about the
 *    SHAPE of a querying pattern — the same name over and over, a sweep of
 *    unrelated names, a pull far larger than the question needed. An officer
 *    who asks a great many perfectly ordinary questions scores zero, by
 *    construction: the volume signals are measured against that officer's own
 *    baseline, never against their colleagues'.
 *
 *  - It is not an accusation, and it never blocks anyone. An investigator
 *    legitimately searches the same name twenty times in an afternoon; an HQ
 *    officer legitimately spends a fortnight on one district; a night-duty
 *    officer legitimately works nights. Every signal below has an innocent
 *    explanation that is MORE likely than the guilty one, and each finding
 *    carries that explanation next to the concern. What a signal buys is that a
 *    human is prompted to look and the officer gets to explain — which is the
 *    safeguard the public is actually owed, and the one silent logging does not
 *    provide. Thresholds are conservative for the same reason: a missed pattern
 *    costs a review, a false flag costs an officer their standing.
 *
 * What the recorded trail can and cannot see is written out in NOT_COVERED
 * below and shown in the console — a control whose blind spots are undocumented
 * is worse than no control at all.
 */

export type MisuseSeverity = "elevated" | "moderate" | "low";

/** Ranking weight. Deliberately flat: three "low" signals outrank one
 *  "elevated", because a pattern showing up several different ways is worth
 *  more of a reviewer's hour than one threshold being crossed once. */
const WEIGHTS: Record<MisuseSeverity, number> = { elevated: 3, moderate: 2, low: 1 };

/**
 * One run, reduced to the facts a signal can reason about. Built from the audit
 * rows in `loadTrail`; detection is pure over these, so it can be tested
 * without a database and replayed over a hypothetical trail.
 */
export interface TrailRun {
  runId: string;
  /** userEmail, or "unattributed" — early trail rows predate the actor columns. */
  officer: string;
  role: string | null;
  /** The scope the query ran under: a district name, or "Statewide". */
  scope: string;
  question: string;
  at: Date;
  /** Person names the run actually FILTERED on — not names it happened to return. */
  personNames: string[];
  /** Districts named as SQL literals: what the officer asked ABOUT, not what they may see. */
  districts: string[];
  /** Largest single tool result, in rows. The proxy for how much data was seen. */
  maxRows: number;
  /** True when the run pointed at a specific case (CrimeNo, CaseMasterID). */
  hasCaseRef: boolean;
}

export interface MisuseFinding {
  /** Stable per officer+signal+subject, so a reviewer can refer to one finding. */
  key: string;
  signal: string;
  title: string;
  /** Why this is a concern, in the terms a reviewer would have to defend publicly. */
  why: string;
  /** The innocent reading, stated alongside — no card ever stands on the concern alone. */
  benign: string;
  severity: MisuseSeverity;
  officer: string;
  /** The specifics: counts, names, windows — enough to start checking. */
  detail: string;
  occurredAt: string;
  runs: { runId: string; at: string; question: string; scope: string }[];
}

export interface OfficerScore {
  officer: string;
  role: string | null;
  runs: number;
  /** Sum of the weights of the signals that fired. A prompt to look, not a grade. */
  score: number;
  findings: number;
  signals: string[];
}

export interface MisuseReport {
  generatedAt: string;
  days: number;
  runsExamined: number;
  officers: number;
  findings: MisuseFinding[];
  byOfficer: OfficerScore[];
  /** Misuse routes this trail cannot see. Named so a clean report is not misread. */
  notCovered: string[];
}

/**
 * The honest limits. Each is a real misuse route the recorded columns simply do
 * not describe, and each would need a schema change to close.
 */
const NOT_COVERED = [
  'Whether the officer had a reason. No case is assigned to a user anywhere in the schema, so "was this file theirs to open" cannot be answered here — only asked.',
  "What left the building. The trail records rows returned, not rows copied, photographed, or forwarded.",
  'Who was at the keyboard. An audit row carries no device, address, or session id, so a shared login and one officer look identical — and "one sitting" below means nothing more than runs close together in time.',
  "Anything asked outside this tool. Direct database access is not in this trail at all.",
];

// ---------------------------------------------------------------------------
// Extraction — what a run was actually about.
//
// Person names are read out of the SQL the tool ran, not out of the officer's
// phrasing: an English question mentioning a name proves nothing, whereas
// "AccusedName" = 'X' is the system having looked X up. Selecting the name
// COLUMN — a list of repeat accused, say — is not a lookup of any one person
// and must not count; only a literal comparison does. That distinction is most
// of what keeps this from flagging ordinary analysis.
//
// The SQL arrives inside a JSON-encoded step result, so every identifier quote
// is stored backslash-escaped (\"AccusedName\"). The optional \\? on each side
// is what makes these match the trail as it is actually written rather than as
// the query was composed.
// ---------------------------------------------------------------------------

const Q = String.raw`\\?"`;
const PERSON_FILTER = new RegExp(
  `${Q}(?:AccusedName|VictimName|ComplainantName)${Q}\\s*(?:=|ILIKE|LIKE)\\s*'%?((?:[^'%]|'')+?)%?'`,
  "gi"
);
const DISTRICT_FILTER = new RegExp(`${Q}DistrictName${Q}\\s*(?:=|ILIKE)\\s*'((?:[^']|'')+)'`, "gi");
// buildCrewDossier takes a person by name directly, with no SQL in between.
const PERSON_ARG = /\\?"person(?:Name)?\\?"\s*:\s*\\?"([^"\\]+)\\?"/gi;
const CASE_REF = /\b\d{18}\b|\\?"(?:crimeNo|caseMasterId|caseId)\\?"\s*:|\\?"CaseMasterID\\?"\s*=\s*\d+/i;

const norm = (s: string) => s.replace(/''/g, "'").replace(/\s+/g, " ").trim();

function matchAll(text: string, re: RegExp): string[] {
  // A module-level regex with /g carries lastIndex between calls; reset it.
  re.lastIndex = 0;
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    const v = norm(m[1] ?? "");
    if (v) out.push(v);
  }
  return out;
}

/** @internal exposed for tests */
export function personNamesIn(text: string): string[] {
  const names = [...matchAll(text, PERSON_FILTER), ...matchAll(text, PERSON_ARG)];
  return [...new Set(names.map((n) => n.toLowerCase()))];
}

/** @internal exposed for tests */
export function districtsIn(text: string): string[] {
  return [...new Set(matchAll(text, DISTRICT_FILTER))];
}

/** @internal exposed for tests */
export function hasCaseRef(text: string): boolean {
  return CASE_REF.test(text);
}

// ---------------------------------------------------------------------------
// Time. Rows are stored in UTC; the officers are in India, and "3 a.m." only
// means anything on their clock.
// ---------------------------------------------------------------------------

const HOUR = 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * HOUR;
const ist = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS);

/** @internal exposed for tests */
export const istHour = (d: Date) => ist(d).getUTCHours();
/** The IST calendar day a run belongs to, as YYYY-MM-DD. */
const istDay = (d: Date) => ist(d).toISOString().slice(0, 10);
/** A night straddles midnight, so a 03:00 run belongs to the night before. */
const istNight = (d: Date) => istDay(new Date(d.getTime() - 6 * HOUR));

// ---------------------------------------------------------------------------
// Thresholds. All are floors a normal working day does not reach, and every
// volume threshold is relative to the officer's own history.
// ---------------------------------------------------------------------------

/** Same officer, same name: four separate askings inside a day. Two or three is
 *  a follow-up; four is a pattern worth one question. */
const REPEAT_LOOKUPS = 4;
const REPEAT_WINDOW_MS = 24 * HOUR;

/** Runs further apart than this are not one sitting. Five unrelated people
 *  inside one, with no case quoted, is a sweep rather than an enquiry. */
const SESSION_GAP_MS = 30 * 60 * 1000;
const SWEEP_NAMES = 5;

/** A single result this large is a dataset, not an answer to a question. */
const BULK_ROWS = 500;

/** A day this far above the officer's OWN median. The floor stops a quiet
 *  officer's median of one turning an ordinary morning into a finding. */
const BURST_FLOOR = 12;
const BURST_MULTIPLE = 3;
/** With fewer active days than this there is no baseline to speak of, so only a
 *  volume no working day plausibly reaches counts. */
const BASELINE_MIN_DAYS = 3;
const BURST_NO_BASELINE = 25;

/** Statewide access narrowing onto one district. Needs enough runs on both
 *  sides of the window for "narrowed" to mean anything at all. */
const FOCUS_MIN_RUNS = 5;
const FOCUS_SHARE = 0.9;
const FOCUS_PRIOR_DISTRICTS = 3;

/** Off-hours is 22:00–06:00 IST: a cluster in one night, from someone who does
 *  not normally work nights. */
const OFFHOURS_START = 22;
const OFFHOURS_END = 6;
const OFFHOURS_BURST = 5;
/** At or above this share of their runs the officer works nights. That is a
 *  roster fact, and flagging it would be flagging a shift. */
const NIGHT_SHIFT_SHARE = 0.4;

const isOffHours = (d: Date) => {
  const h = istHour(d);
  return h >= OFFHOURS_START || h < OFFHOURS_END;
};

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const when = (d: Date) => d.toISOString();
const latest = (runs: TrailRun[]) => runs.reduce((a, b) => (a.at > b.at ? a : b)).at;

/** The runs behind a finding, newest first — a reviewer starts from the last one. */
const cite = (runs: TrailRun[]) =>
  [...runs]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map((r) => ({ runId: r.runId, at: when(r.at), question: r.question, scope: r.scope }));

/** Split an officer's runs into sittings: consecutive runs no more than
 *  SESSION_GAP_MS apart. The closest this trail gets to a session. */
function sessions(runs: TrailRun[]): TrailRun[][] {
  const sorted = [...runs].sort((a, b) => a.at.getTime() - b.at.getTime());
  const out: TrailRun[][] = [];
  for (const run of sorted) {
    const last = out[out.length - 1];
    if (last && run.at.getTime() - last[last.length - 1].at.getTime() <= SESSION_GAP_MS) last.push(run);
    else out.push([run]);
  }
  return out;
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = m.get(k);
    if (list) list.push(it);
    else m.set(k, [it]);
  }
  return m;
}

// ---------------------------------------------------------------------------
// The signals. Each takes one officer's runs and returns findings about their
// querying — never about them.
// ---------------------------------------------------------------------------

/**
 * The classic pattern: one officer going back to one named person again and
 * again inside a short window. It is what checking up on a neighbour, an
 * ex-partner, a relative or a local figure looks like in a log.
 */
function repeatedPersonLookups(officer: string, runs: TrailRun[]): MisuseFinding[] {
  const byName = new Map<string, TrailRun[]>();
  for (const run of runs) {
    for (const name of run.personNames) {
      const list = byName.get(name);
      if (list) list.push(run);
      else byName.set(name, [run]);
    }
  }

  const findings: MisuseFinding[] = [];
  for (const [name, hits] of byName) {
    const sorted = [...hits].sort((a, b) => a.at.getTime() - b.at.getTime());
    // The densest window: the largest cluster of REPEAT_LOOKUPS or more that
    // fits inside REPEAT_WINDOW_MS. One repeat is not a pattern; a cluster is.
    let burst: TrailRun[] | null = null;
    for (let i = 0; i + REPEAT_LOOKUPS - 1 < sorted.length; i++) {
      const last = sorted[i + REPEAT_LOOKUPS - 1];
      if (last.at.getTime() - sorted[i].at.getTime() > REPEAT_WINDOW_MS) continue;
      const window = sorted.filter(
        (r) => r.at >= sorted[i].at && r.at.getTime() - sorted[i].at.getTime() <= REPEAT_WINDOW_MS
      );
      if (!burst || window.length > burst.length) burst = window;
    }
    if (!burst) continue;

    // A named case anywhere in the cluster is the ordinary reading — an
    // investigator working a file. It stays a finding, one step quieter.
    const grounded = burst.some((r) => r.hasCaseRef);
    const spanH = (burst[burst.length - 1].at.getTime() - burst[0].at.getTime()) / HOUR;

    findings.push({
      key: `repeat-person:${officer}:${name}`,
      signal: "repeat-person",
      title: `Same person looked up ${burst.length} times`,
      why:
        "Going back to one named person repeatedly inside a short window, with nothing else about the questions changing, is the shape a personal-interest lookup takes in a log. It is the single pattern this kind of oversight exists to catch.",
      benign: grounded
        ? "An investigator working an active file searches the same name all day, and a case number does appear in this cluster."
        : "An investigator working an active file searches the same name all day. Ask which enquiry these belonged to before reading anything into it.",
      severity: grounded ? "moderate" : "elevated",
      officer,
      detail: `${burst.length} separate queries filtering on "${name}" within ${
        spanH < 1 ? "under an hour" : `${spanH.toFixed(1)} hours`
      }${grounded ? "; a case number appears in the cluster" : "; no case number appears in any of them"}.`,
      occurredAt: when(latest(burst)),
      runs: cite(burst),
    });
  }
  return findings;
}

/**
 * Many unrelated names in one sitting with no case quoted anywhere: the shape
 * of running a list of people through the system — tenants, applicants,
 * acquaintances — rather than investigating something.
 */
function nameSweeps(officer: string, runs: TrailRun[]): MisuseFinding[] {
  const findings: MisuseFinding[] = [];
  for (const sitting of sessions(runs)) {
    const named = sitting.filter((r) => r.personNames.length);
    const names = new Set(named.flatMap((r) => r.personNames));
    if (names.size < SWEEP_NAMES) continue;
    // A case reference anywhere in the sitting makes this an investigator
    // working one file with several people in it, which is the normal thing.
    if (sitting.some((r) => r.hasCaseRef)) continue;

    const mins = Math.max(1, Math.round((latest(named).getTime() - named[0].at.getTime()) / 60000));
    findings.push({
      key: `name-sweep:${officer}:${named[0].runId}`,
      signal: "name-sweep",
      title: `${names.size} different people looked up in one sitting`,
      why:
        "A run of distinct names in quick succession, none of them tied to a case, is what running a list of people through the system looks like — vetting tenants, applicants, or acquaintances. Police records may be used for the matter in front of the officer, not as a background-check service.",
      benign:
        "One complex enquiry can genuinely touch many people, and this trail cannot see a case file that was never quoted in the question.",
      severity: "elevated",
      officer,
      detail: `${names.size} distinct names across ${named.length} queries in ${mins} minute${
        mins === 1 ? "" : "s"
      }, none referencing a case: ${[...names].slice(0, 6).join(", ")}${names.size > 6 ? ", …" : ""}.`,
      occurredAt: when(latest(named)),
      runs: cite(named),
    });
  }
  return findings;
}

/** A single result far larger than any actionable question needs. */
function bulkResults(officer: string, runs: TrailRun[]): MisuseFinding[] {
  const big = runs.filter((r) => r.maxRows >= BULK_ROWS);
  if (!big.length) return [];
  const worst = Math.max(...big.map((r) => r.maxRows));
  return [
    {
      key: `bulk-rows:${officer}`,
      signal: "bulk-rows",
      title: `${big.length} quer${big.length === 1 ? "y" : "ies"} returned bulk data`,
      why:
        "A question an officer can act on comes back in tens of rows. Thousands is a dataset, and a dataset can leave with someone. Large pulls are the difference between using a police system and copying one.",
      benign:
        "Analysis and reporting work legitimately produces large result sets, and nothing recorded here distinguishes a report from an extraction.",
      severity: worst >= BULK_ROWS * 4 ? "elevated" : "moderate",
      officer,
      detail: `Largest single result ${worst.toLocaleString("en-IN")} rows (threshold ${BULK_ROWS}); ${big.length} such run${
        big.length === 1 ? "" : "s"
      } over the window.`,
      occurredAt: when(latest(big)),
      runs: cite(big),
    },
  ];
}

/**
 * A day far above what this officer normally does. Measured against their own
 * median and nobody else's: the point is a change in one person's behaviour,
 * and a busy officer having a busy day is not a finding.
 */
function volumeBurst(officer: string, runs: TrailRun[]): MisuseFinding[] {
  const byDay = groupBy(runs, (r) => istDay(r.at));
  if (byDay.size < 2) return [];

  const findings: MisuseFinding[] = [];
  for (const [day, dayRuns] of byDay) {
    // The officer's own baseline, with the candidate day left out so a single
    // huge day cannot pull up the median it is being compared against.
    const others = [...byDay.entries()].filter(([d]) => d !== day).map(([, v]) => v.length);
    const base = median(others);
    const enoughHistory = others.length >= BASELINE_MIN_DAYS - 1;
    const threshold = enoughHistory ? Math.max(BURST_FLOOR, Math.ceil(base * BURST_MULTIPLE)) : BURST_NO_BASELINE;
    if (dayRuns.length < threshold) continue;

    findings.push({
      key: `volume-burst:${officer}:${day}`,
      signal: "volume-burst",
      title: `${dayRuns.length} queries in one day`,
      why:
        "A jump in one officer's own query volume can be the ordinary rhythm of a case breaking, or it can be someone working through a list before an access is taken away. Either way it is a change that should have a one-sentence explanation.",
      benign:
        "A case breaking, a court deadline, or a day rostered to analysis all look exactly like this. The comparison is against this officer alone, so it says nothing about how hard anybody works.",
      severity: "low",
      officer,
      detail: enoughHistory
        ? `${dayRuns.length} runs on ${day}, against a usual ${base} per active day for this officer.`
        : `${dayRuns.length} runs on ${day}; too few active days to establish this officer's own baseline, so a flat threshold was used.`,
      occurredAt: when(latest(dayRuns)),
      runs: cite(dayRuns),
    });
  }
  return findings;
}

/**
 * Statewide access suddenly pointed at one district.
 *
 * A district officer working their own district is the job — so this looks only
 * at unrestricted users. An HQ account that ranged across the state and then
 * spent a fortnight on one district is a different thing, and it is visible
 * only because the trail records both the scope a query ran under and the
 * district it asked about.
 */
function districtNarrowing(officer: string, runs: TrailRun[], now: Date, days: number): MisuseFinding[] {
  const statewide = runs.filter((r) => r.scope === "Statewide" && r.districts.length);
  if (statewide.length < FOCUS_MIN_RUNS * 2) return [];

  const midpoint = now.getTime() - (days / 2) * 24 * HOUR;
  const recent = statewide.filter((r) => r.at.getTime() >= midpoint);
  const earlier = statewide.filter((r) => r.at.getTime() < midpoint);
  if (recent.length < FOCUS_MIN_RUNS || earlier.length < FOCUS_MIN_RUNS) return [];

  const priorSpread = new Set(earlier.flatMap((r) => r.districts));
  if (priorSpread.size < FOCUS_PRIOR_DISTRICTS) return [];

  const tally = new Map<string, number>();
  for (const r of recent) for (const d of new Set(r.districts)) tally.set(d, (tally.get(d) ?? 0) + 1);
  const [top, hits] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  if (!top) return [];
  const share = hits / recent.length;
  if (share < FOCUS_SHARE) return [];
  // If that district was already their patch in the earlier half, nothing narrowed.
  const priorShare = earlier.filter((r) => r.districts.includes(top)).length / earlier.length;
  if (priorShare >= FOCUS_SHARE) return [];

  const focused = recent.filter((r) => r.districts.includes(top));
  return [
    {
      key: `district-narrowing:${officer}:${top}`,
      signal: "district-narrowing",
      title: `Statewide access narrowed onto ${top}`,
      why:
        "Unrestricted access is granted for a statewide job. When it is used almost exclusively on one district it has stopped serving that job, and the reason — a deputation, a transfer, an interest in somewhere personal — is easiest to establish while it is recent.",
      benign:
        "A temporary deputation, a special investigation team, or one large enquiry in that district explains this completely. Only the officer can say which.",
      severity: "low",
      officer,
      detail: `${Math.round(share * 100)}% of the last ${Math.round(
        days / 2
      )} days' district-specific queries were about ${top} (${hits} of ${recent.length}), against ${
        priorSpread.size
      } districts in the previous half of the window.`,
      occurredAt: when(latest(focused)),
      runs: cite(focused),
    },
  ];
}

/**
 * A cluster of queries at night, from someone who does not normally work
 * nights. Timestamps are the only thing the trail has to say a system was used
 * away from colleagues. Being alone with it is not evidence of anything — it is
 * only the window in which unexplained access is hardest to account for later.
 */
function offHoursBursts(officer: string, runs: TrailRun[]): MisuseFinding[] {
  const night = runs.filter((r) => isOffHours(r.at));
  if (!night.length) return [];
  // Someone rostered to nights is a shift pattern, not a signal.
  if (night.length / runs.length >= NIGHT_SHIFT_SHARE) return [];

  const findings: MisuseFinding[] = [];
  for (const [label, block] of groupBy(night, (r) => istNight(r.at))) {
    if (block.length < OFFHOURS_BURST) continue;
    const hours = [...new Set(block.map((r) => istHour(r.at)))].sort((a, b) => a - b);
    const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;
    findings.push({
      key: `off-hours:${officer}:${label}`,
      signal: "off-hours",
      title: `${block.length} queries overnight`,
      why:
        "Sustained use of a police database between 22:00 and 06:00 by an officer who otherwise works days is use with nobody around. That is not wrongdoing, but it is the hardest access to account for after the fact, so it is the access most worth recording an explanation against.",
      benign:
        "Night duty, an emergency callout, or a rostering change all produce exactly this, and the trail holds no shift roster to check it against.",
      severity: "low",
      officer,
      detail: `${block.length} runs on the night of ${label}, between ${pad(hours[0])} and ${pad(
        hours[hours.length - 1]
      )} IST. Off-hours is ${Math.round((night.length / runs.length) * 100)}% of this officer's activity overall.`,
      occurredAt: when(latest(block)),
      runs: cite(block),
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Detection, pure over TrailRun[].
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: MisuseSeverity[] = ["elevated", "moderate", "low"];

/**
 * Run every signal over the trail and rank what fired.
 *
 * Pure: `now` and `days` are arguments, so the same trail always produces the
 * same report — in a test, or in the console, or in a hearing.
 */
export function detectMisuse(runs: TrailRun[], now: Date = new Date(), days = 30): MisuseReport {
  const byOfficer = groupBy(runs, (r) => r.officer);
  const findings: MisuseFinding[] = [];

  for (const [officer, officerRuns] of byOfficer) {
    findings.push(
      ...repeatedPersonLookups(officer, officerRuns),
      ...nameSweeps(officer, officerRuns),
      ...bulkResults(officer, officerRuns),
      ...volumeBurst(officer, officerRuns),
      ...districtNarrowing(officer, officerRuns, now, days),
      ...offHoursBursts(officer, officerRuns)
    );
  }

  findings.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      b.occurredAt.localeCompare(a.occurredAt)
  );

  // Only officers with something that fired appear. A list of everyone with a
  // zero next to most names reads as a leaderboard, and this is not one.
  const byOfficerScores: OfficerScore[] = [...byOfficer.entries()]
    .map(([officer, officerRuns]) => {
      const mine = findings.filter((f) => f.officer === officer);
      return {
        officer,
        role: officerRuns[0]?.role ?? null,
        runs: officerRuns.length,
        score: mine.reduce((sum, f) => sum + WEIGHTS[f.severity], 0),
        findings: mine.length,
        signals: [...new Set(mine.map((f) => f.signal))],
      };
    })
    .filter((s) => s.findings > 0)
    .sort((a, b) => b.score - a.score || b.findings - a.findings || a.officer.localeCompare(b.officer));

  return {
    generatedAt: now.toISOString(),
    days,
    runsExamined: runs.length,
    officers: byOfficer.size,
    findings,
    byOfficer: byOfficerScores,
    notCovered: NOT_COVERED,
  };
}

// ---------------------------------------------------------------------------
// Loading the trail.
// ---------------------------------------------------------------------------

/**
 * Audit rows, folded into one TrailRun each. Grouped the way lib/audit.ts groups
 * them — a run is the unit an officer is accountable for — with the person and
 * district filters gathered off its steps.
 */
export async function loadTrail(days: number): Promise<TrailRun[]> {
  const since = new Date(Date.now() - Math.min(Math.max(days, 1), 365) * 24 * HOUR);
  const rows = await prisma.agentAuditLog.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
  });

  const byRun = new Map<string, TrailRun>();
  for (const r of rows) {
    let run = byRun.get(r.runId);
    if (!run) {
      run = {
        runId: r.runId,
        officer: r.userEmail ?? "unattributed",
        role: r.userRole,
        scope: r.districtName ?? "Statewide",
        question: r.question,
        at: r.createdAt,
        personNames: [],
        districts: [],
        maxRows: 0,
        hasCaseRef: false,
      };
      byRun.set(r.runId, run);
    }
    // A run that never wrote its closing row still has steps; the earliest row
    // is when the officer asked.
    if (r.createdAt < run.at) run.at = r.createdAt;

    // Both halves matter: `args` is what the tool was asked for, `result` holds
    // the SQL that actually ran, and a name filter can appear in either.
    const text = `${r.args ?? ""}\n${r.result ?? ""}`;
    for (const n of personNamesIn(text)) if (!run.personNames.includes(n)) run.personNames.push(n);
    for (const d of districtsIn(text)) if (!run.districts.includes(d)) run.districts.push(d);
    if (r.rowCount != null && r.rowCount > run.maxRows) run.maxRows = r.rowCount;
    if (!run.hasCaseRef && hasCaseRef(`${r.question}\n${text}`)) run.hasCaseRef = true;
  }

  return [...byRun.values()];
}

/** The report the console reads. */
export async function misuseReport(days = 30): Promise<MisuseReport> {
  const runs = await loadTrail(days);
  return detectMisuse(runs, new Date(), days);
}
