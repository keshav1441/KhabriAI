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
   └─ findSimilarCases    Modus-operandi linking — pgvector cosine over narrative embeddings (Mistral)
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
| Crime hotspot map | Leaflet, per-incident lat/lng across Karnataka |
| Criminal network graph | Cytoscape + cose-bilkent, real accused co-occurrence cliques |
| Profiling view | Per-person case history, associates, timeline |
| Reports & early warning | Anomaly insights + least-squares 6-month trend forecast per district × crime group |
| Risk prediction | Chargesheet likelihood with **per-feature contributions**, not a bare score |
| **Modus-operandi linking** | pgvector nearest-narrative search: "which cases, anywhere in the state, describe the same method?" — from a case, a CrimeNo, or a free-text description; cross-district links flagged |
| Kannada localization | Full nav/chat UI in Kannada, questions accepted in either language |
| Voice + export | Speech in/out, conversation PDF export, CSV result export |
| Auth & history | PBKDF2-SHA512, HMAC-signed session cookie, per-user chat threads in Neon |

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

- **Read-only by construction.** Generated SQL passes a validator that permits `SELECT` only and
  blocks multi-statement injection before it reaches the database.
- **Risk scores are interpretable.** The local chargesheet model returns signed per-feature
  contributions derived from the data's actual generative process — not a black-box output.
- **Forecasts are transparent.** A least-squares slope, stated as "rising N cases/month,
  projected M next month" — auditable arithmetic, not an opaque model.
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
