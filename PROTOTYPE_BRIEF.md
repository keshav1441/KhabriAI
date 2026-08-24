# KhabriAI — Prototype Brief

**Karnataka Police Crime Intelligence Assistant**
Datathon 2026 · KSP × Hack2Skill, Challenge 1

---

## Problem

Karnataka State Police holds FIR data across 30 districts and 210 police stations, but an
investigator cannot interrogate it. Answering "which accused have more than 2 cases in the last
30 days in Bengaluru Urban?" today means filing a request with an analyst who writes SQL. The
data exists; the access path does not. The result is that operational decisions get made on
intuition while the evidence sits one query away.

## Solution

A conversational intelligence layer over the KSP crime database. An investigator signs in and
asks a question in plain English or Kannada. An agent orchestrator plans which tools to call,
executes them, streams each step live to a **Case Board** in the chat, and returns an analyst
narrative alongside the right visualization — table, chart, network graph, or map — plus
citations to the actual FIR narratives that support it.

No SQL is shown. No dashboard to learn. The interface is a question.

## How it works

```
Question (EN / KN)
   │
   ▼
Agent orchestrator (Mistral) — plans up to 4 tool iterations, first turn must call a tool
   │
   ├─ queryDatabase       RAG few-shot retrieval → SQL generation → SELECT-only validation → Neon
   ├─ searchRelatedCases  Postgres full-text search over FIR narratives → citations
   ├─ checkInsights       Precomputed anomalies: spikes, repeat accused, district surges
   ├─ getNetworkOrMapData Accused co-occurrence graph / per-district geospatial counts
   ├─ predictRisk         Chargesheet likelihood — Catalyst QuickML, local explainable fallback
   ├─ findSimilarCases    Modus-operandi linking — pgvector cosine over narrative embeddings (Mistral)
   └─ predictHotspots     Where cases are projected to land next, and which stations carry that load
   │
   ▼
SSE stream: tool steps → result metadata (rows, vizType, citations) → narrative tokens
   │
   ▼
Persisted to Neon (chat history) · audited to Catalyst Data Store
```

**Retrieval is three subsystems.** Few-shot example selection for SQL generation uses Mistral
embeddings (`mistral-embed`, cached vectors), falling back to an LLM picker when the embeddings API
is unavailable. Case citations use native Postgres `tsvector`/`ts_rank` full-text search with a
≥2-content-word overlap gate — this is what stops aggregate questions ("how many FIRs last
month") from surfacing spurious "related" cases. Modus-operandi linking (below) uses pgvector
cosine distance over narrative embeddings stored on `CaseMaster.BriefFactsEmbedding`.

## What's built

| Capability | Implementation |
|---|---|
| Conversational query + live agent trace | SSE streaming, Case Board step timeline |
| Auto-visualization | SQL shape → table / bar / line / Cytoscape network |
| Crime hotspot map | Leaflet — Karnataka's 30 districts plotted at hardcoded centroids, pins sized and coloured by that district's case count (`/api/map-data`); not per-incident coordinates |
| **Predictive hotspots** | Least-squares trend per district × crime group over the last six *complete* months, projected forward: an Observed \| Predicted layer on the map and a ranked patrol-priorities panel, each row stating its slope, its fit and its confidence, with the stations carrying the district's recent load named from the last 90 days |
| Criminal network graph | Cytoscape + cose-bilkent, real accused co-occurrence cliques |
| Profiling view | Per-person case history, associates, timeline |
| Reports & early warning | Anomaly insights + least-squares 6-month trend forecast per district × crime group |
| Risk prediction | Chargesheet likelihood with **per-feature contributions**, not a bare score |
| **Modus-operandi linking** | pgvector nearest-narrative search: "which cases, anywhere in the state, describe the same method?" — from a case, a CrimeNo, or a free-text description; cross-district links flagged |
| **Crew dossier** | Walks outward from one FIR or one person along co-accused links and matching narratives: members, case timeline, districts crossed, recurring signature phrases — and how each case was reached |
| **Proactive alerts** | The detectors run on a schedule, not on a page view: spikes, repeat accused, weekly surges, forecasts and cross-district MO matches are written as per-officer alerts and surfaced in a header bell; clicking one puts the investigating question in the chat |
| **Answer feedback → few-shot learning** | Thumbs-up/down on every answer; a thumbs-down carries the question, the SQL and the tools that ran. An HQ reviewer writes the query it should have used, and once that passes the SELECT-only validator *and* executes, the pair becomes a few-shot example the next similar question retrieves — no redeploy. The holdout eval deliberately ignores learned examples |
| **Audit trail** | Every tool call and every completed question written with the officer, the scope it ran under, the arguments, the row count and the latency — to Postgres, an off-box Catalyst table and a local JSONL file. Readable at `/admin/audit`, grouped by question, filterable by officer, tool, scope and failure |
| Kannada localization | Full nav/chat UI in Kannada, questions accepted in either language |
| Voice + export | Speech in/out, conversation PDF export, CSV result export |
| Auth & history | Neon Auth (Google via shared OAuth, email one-time codes) bridged to an HMAC-signed app session; password accounts for scripts; per-user chat threads in Neon |
| **Role-based scope** | An SHO is bound to one district; an HQ user is statewide. Enforced by Postgres row-level security on every case table — the model's SQL, the Case File drawer, profiling, network, map and MO links all see only that district |

## Modus-operandi linking — the capability a station cannot have on its own

A station sees its own FIRs. A crew that cuts window grilles between 1 and 3 am and takes only gold
is one unsolved burglary in Tumakuru, another in Mandya, a third in Ramanagara — three separate
files, three investigating officers, no link. KhabriAI embeds every narrative (`mistral-embed`,
pgvector) and answers "what else looks like this?":

- **From a case.** Open any case; the drawer shows *Similar Modus Operandi* — the five nearest
  narratives statewide with a similarity score, links that cross a district boundary marked in red.
  Click one to walk the chain.
- **From the chat.** "Find cases with the same MO as FIR 1000300152026…", "Has anyone else reported
  a KYC-expiry SMS scam where the money went to Jharkhand ATMs?" → the `findSimilarCases` tool
  returns the linked cases as a table plus the narratives as citations.
- **Matched on method, not names.** Narratives never name the accused, so a link means the *facts*
  match — the same thing an experienced detective notices, done across 210 stations at once.

Measured with `npm run eval:similarity` on a random sample of embedded cases (5 nearest neighbours each):
how often neighbours share the specific crime type and the crime group, and — for cases that belong
to a repeat-offender series — how often a same-crew case is found from the narrative alone, and what
share of those links cross a district boundary. Results are recorded in `eval/results/*-similarity.json`
and quoted in the Evaluation section below once the full corpus is embedded.

## Crew dossier — from one link to the series behind it

A single MO link answers "what else looks like this?". An investigation needs the next three
questions: who is behind it, where has it run, and what is already done about it. From any case —
or any accused — KhabriAI walks two hops outward along two kinds of edge: people charged in the
same FIR, and narratives that describe the same method. It returns a briefing: the members with
their case counts and arrests, the case timeline, the districts crossed, and the phrases the
narratives keep repeating — the crew's habit in the files' own words. Co-accused hops stay inside
the seed's crime groups, so a prolific offender's unrelated cases do not flood the dossier, and the
caps (40 cases, 25 members) are spent on the strongest evidence first and declared when they bite.

Every case in the dossier states **how it was reached** — seed, co-accused, or a narrative match
with its score and the case it matched against. A co-accused link is a fact from the FIR; an MO link
is a number the officer can judge. Nothing in the briefing is an unexplained assertion, which is what
lets an officer defend it in review — and print it, as the dossier exports to PDF for the case file.

One run on the synthetic corpus (`npm run crew -- --case 13778`): 40 cases, 25 members, 21 districts,
4 chargesheeted against 36 still open, spanning 2024-10-02 to 2026-08-12, with the signature coming
back as "men on a black pulsar without a number plate" and "cut the cctv cable", and MO links in the
0.92–0.95 range chaining across districts. That is one seed on seeded data, not an evaluation.

## Proactive alerts — the system does not wait to be asked

Everything above answers a question an officer thought to ask. The detectors also run without one.
On a schedule (`/api/cron/alerts`, or the same job that warms the insights cache), the anomaly and
forecast detectors run, and a cross-district MO linker takes each case registered in the last 30 days
and finds its nearest narrative **in a different district**. Every finding is fanned out as an alert row
to the officers whose scope it falls in — an SHO gets their district's findings plus statewide ones,
HQ gets all of them — and appears in a bell in the header; clicking it drops the investigating question
into the chat.

An MO match is written to **both** districts, so the SHO who registered the case and the SHO holding
the matching file are told about each other on the same run. That is the link neither station can make alone, and neither would
have gone looking for. Findings are deduplicated on a unique `(officer, finding)` key, so a re-run
re-notifies nobody — an alert is new only when the numbers behind it move. On the synthetic corpus this
fires on the seeded repeat-offender series; it is a mechanism, not a measured result.

## Predictive hotspots — a map of last month does not allocate next week's shift

A map of what already happened tells an SHO where officers were needed, not where they will be.
KhabriAI fits a least-squares trend per district × crime group over the last six **complete** months
— the running month is excluded, because it is always partial and including it bends every trend
downwards — and projects the next. The map gains an **Observed | Predicted** toggle, predicted pins
on an amber→red ramp so a projection is never mistaken for a count, and a ranked **patrol
priorities** panel. Every row states its slope, its R² fit and a low/medium/high confidence drawn
from both, with the method and the months fitted printed under the numbers rather than behind a
tooltip — so the projection can be argued with instead of obeyed. A cell qualifies only with a
rising slope, twelve cases of history and a projection above the current rate, and the ranking
discounts uplift by fit, so a jump from one case to eight on a poor line does not outrank a
well-fitted rise. The forecast stops at the district on purpose: ~95 cases per station across the
whole corpus is too sparse to trend, and a confident line through noise is worse than none. Stations
are *named* instead, by their share of the district's last 90 days — an observed fact, and what
turns a trend into a patrol order.

One run on the synthetic corpus (`npm run hotspots`): 30 districts, 12 patrol priorities in ~1.3 s.
Top priority was Crimes Against Women in Chikkaballapura — 1 case in the last 30 days against 7
projected, +0.91/month, medium confidence, with 77% of the last 90 days at Chikkaballapura City PS
(44%), North PS (22%) and Market PS (11%). The highest-confidence cell was Crimes Against Body in
Dakshina Kannada, 7 → 11 at +1.23/month, fit 0.68. That is one run on seeded data, not an evaluation.

## Answer feedback — a correction becomes a few-shot example

Every answer carries a thumbs-up / thumbs-down, and a thumbs-down opens a *what was wrong* box. The
vote is not the point; what travels with it is — the question, the SQL that was generated for it, and
the tools that ran. That is everything a reviewer needs to decide whether the pipeline asked the
database the right thing. At `/admin/feedback` an HQ reviewer writes the query the answer should have
used, and approving it does two things before anything is stored: the SQL goes through the same
SELECT-only validator the model's own output does, and it is **executed once** against the real
schema under the standard row cap and statement timeout. An example that does not run would teach the
wrong shape to every question that later retrieves it.

Approved pairs are stored in Postgres, embedded on approval, and merged into few-shot retrieval at
query time — so a correction changes the next officer's answer without a redeploy, which the seeded
example file cannot do once the app is packaged. The evaluation number is deliberately walled off
from this: when the harness runs its holdout, learned examples are skipped entirely, so accuracy keeps
measuring generalisation rather than how much the system has been corrected. One run on the synthetic
corpus (`npm run feedback`): a thumbs-down recorded, the corrected SQL validated and executed (5 rows),
embedded, and the same question then retrieving that example at 1.000 — above the seeded examples that
had scored 0.867 / 0.863 / 0.854.

## Audit trail — who asked, what ran, under what scope

Every tool call the agent made was already being written down. The problem was where: a file next to
the process and a Catalyst table, neither queryable from the app, and neither recording who asked or
how far their posting let them see. An audit trail nobody can read is not an audit trail.

Each tool call and each completed question is now written to Postgres as well, with the officer's
identity, the district scope the query actually ran under, the arguments, a truncated result that
states that it was truncated, the row count, and the latency. Two other sinks are kept on purpose:
the Catalyst table because it is off-box — an operator with database access cannot quietly edit it —
and a local JSONL file because it still works when the database is the thing that broke. All three
writes are fire-and-forget; an audit write must never fail a query an officer is waiting on. The audit
row deliberately holds no foreign key to the user table: deleting an account must not erase the record
of what was asked under it.

`/admin/audit` reads it back grouped by **run** — one question — because that is the unit a reviewer is
accountable for; filtering to a tool still returns the question that produced the call. District-bound
scope is rendered distinctly from statewide, since what the officer was *allowed* to see is the point.
One run on the synthetic corpus (`npm run audit`): 4 runs, 4 tool calls, 0 failures, median run
6,621 ms, `queryDatabase` 3 calls at a 3,603 ms median. Nothing prunes the table yet.

## Handling real questions, not benchmark questions

Officers type "Belgavi", "Gulbarga", "everything on Ravi" and "now only for 2025". The pipeline is
built for that:

- **Fuzzy entity resolution.** District, station and crime-type literals in generated SQL are checked
  against the real vocabulary (trigram similarity + an alias table for legacy names: Bangalore,
  Mysore, Belgaum, Gulbarga, Tumkur…). A correction is shown on the Case Board ("Belgavi → Belagavi")
  and stated in the narrative. Person names are **never** silently rewritten — a police tool must not
  change who a query is about.
- **Near-miss names.** A person query that returns nothing comes back with the closest real names
  ("Priya Bhatt" → Priya Bhat, …) and the agent asks which one was meant.
- **Ambiguity guard.** A bare first name that matches many distinct people ("Ravi" → 40+ records)
  returns *no* rows; the agent asks for the full name, PersonID or district instead of listing
  strangers. The agent can also ask a clarifying question of its own (`askClarification` tool) when a
  request can't be answered without guessing something that changes the answer.
- **Follow-ups.** The previous turn's SQL travels with the chat history, so "now only for 2025"
  refines the last query instead of re-interpreting the prose.

## Explainability & safety

The prototype is designed so a police officer can defend an answer in a review.

- **Scope is enforced by the database, not the prompt.** A district-posted officer's every query runs
  as a non-owner Postgres role inside a transaction that sets `app.district_id`; row-level-security
  policies on `CaseMaster` and its child tables (accused, victims, arrests, chargesheets, sections)
  hide everything else — whatever SQL the model writes, including queries that never touch
  `CaseMaster`. HQ users are unrestricted. The header shows the active scope.

- **Read-only by construction.** Generated SQL passes a validator that permits `SELECT` only and
  blocks multi-statement injection before it reaches the database.
- **Risk scores are interpretable.** The local chargesheet model returns signed per-feature
  contributions derived from the data's actual generative process — not a black-box output.
- **Forecasts are transparent.** A least-squares slope, stated as "rising N cases/month,
  projected M next month" — auditable arithmetic, not an opaque model. The predictive hotspots
  publish the same line's R² and a confidence level beside every projected number, and the fitted
  months alongside the method, so an officer can see when the trend does not hold.
- **Every answer is cited.** Related Cases surfaces the real FIR narratives behind the numbers.
- **Every tool call is audited** to a Catalyst Data Store table.

## Data

20,000 synthetic FIR records calibrated to NCRB Karnataka crime-type proportions, across 1 state,
30 districts and 210 police stations — with victims, accused, arrests, chargesheets, courts, and
act/section associations. The schema mirrors the real KSP structure (29 models), so pointing the
prototype at production data is a connection-string change, not a rewrite.

Narratives are LLM-expanded from the seed's templated brief facts (`scripts/enrich-briefs.ts`). Where
the same repeat offender has two or more cases in the same crime group, those cases are written with a
consistent modus operandi in two layers, the way a real crew's FIRs read: *crew* traits (vehicle, time
window, signature habit) are identical across the series, while *offence* traits (method, target) follow
the specific crime type, so a Cheating case reads as cheating even when the same crew also burgles.
Both are chosen deterministically per series (`lib/mo-signature.ts`). The accused are never named in a
narrative. This is stated here because it is what makes the MO-linking evaluation meaningful: the
linker is scored on recovering those series from the text alone.

## Stack

Next.js 16 (App Router, standalone) · React 19 · Neon PostgreSQL + Prisma 7 + pgvector · Mistral
(agent, SQL, narrative, embeddings) · Zoho Catalyst AppSail (hosting, Cache, Data Store, QuickML,
Job Scheduling) · Leaflet · Cytoscape · Recharts · Zustand · Tailwind v4.

Catalyst services degrade gracefully — the app runs fully on a laptop with only a database URL
and a Mistral key.

## Evaluation

`npm run eval -- --holdout` runs 93 question → gold-SQL pairs (83 English, 10 Kannada) through the
**same pipeline the agent uses** (`lib/text-to-sql.ts`) and reports two numbers separately:
*executes* (the SQL ran) and *matches* — the generated result set equals the gold SQL's result set
(Spider-style execution match: value-only, order-insensitive, numbers at 2 dp, row lists compared on
the set of `CaseMasterID`s). Holdout excludes each question's own example from few-shot retrieval.

| Run (93 q, holdout) | executes | **matches** | Kannada | median latency |
|---|---|---|---|---|
| without SQL self-repair | 97% | **81%** | 10/10 | 2.3 s |
| with one error-feedback repair | 99% | **84%** | 10/10 | 2.4 s |

After adding legacy-name and case-number questions (99 q): 81% match, 97% executes, 10/10 Kannada.
A later prompt pass (month formatting, no stray ID columns, "per district" vs "most", chargesheet
semantics, age bands) lifted *executes* to 100% and left *matches* at 82% — the remaining misses are
interpretation choices (which columns to show, whether "top" implies a limit), not wrong joins.
Run-to-run LLM variance is a few points; treat the figure as low-to-mid 80s, not a single number.

**Modus-operandi linking** (`npm run eval:similarity`, 300 random cases, 5 nearest neighbours each, full
corpus of 19,975 embedded narratives): neighbours share the crime group **96%** and the specific crime
type **67%** of the time (28% with the first group-level signatures — the two-layer crew/offence
signatures fixed that). For cases in a repeat-offender series, a same-crew case is among the 5
neighbours **18%** of the time from the narrative alone — against 20,000 candidates, many of which share
two or three of the five MO details — and **87%** of those crew links cross a district boundary, which
is the link a single station cannot make. 570 ms per query over pgvector HNSW.

**Load** (`npm run loadtest`, production build, 5 concurrent officers × 2 rounds, 10/10 answered): a
question takes ~7 s to the first narrative token (planner → SQL generation → execution → synthesis);
a second burst of 5 within the same minute hit the Mistral tier's rate limit and stretched to 38 s
(p95). Single-demo and small-station use is comfortable; sustained concurrency needs a higher Mistral
tier, not a code change.

Per-question SQL, verdict, repair flag and latency for every run are committed under `eval/results/`.
The remaining misses are presentation choices the model makes (`TO_CHAR 'YYYY-MM'` vs `DATE_TRUNC`,
an extra ID column) and occasional syntax slips — not wrong joins or wrong filters.

Guards on every generated query: AST-validated `SELECT`-only, a hard `LIMIT 500`, and an 8 s
`statement_timeout`, so a bad query can never hold a database connection. Unit tests for the guards,
the repair loop and the comparator: `npm test`.

## Current state & limits

Working end-to-end and deployed on Catalyst AppSail. Known boundaries:

- Synthetic data. Calibrated to NCRB proportions, but not real FIRs.
- Case citations depend on narrative enrichment (`scripts/enrich-briefs.ts`); on raw seed data the
  templated `BriefFacts` are too generic to retrieve meaningfully.
- QuickML risk prediction is AppSail-only; local runs use the explainable fallback model.
- Embeddings are 1024-dim `mistral-embed`; re-embedding the corpus is a 5-minute script
  (`npm run embed -- --force`) if a stronger model is preferred.

## Why it matters

The value is not the chat box. It is that a station-level officer, with no analyst and no SQL,
can ask a question at 2am and get a cited, explainable, auditable answer — in Kannada if that's
the language they think in.
