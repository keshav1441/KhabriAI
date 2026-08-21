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
   └─ predictRisk         Chargesheet likelihood — Catalyst QuickML, local explainable fallback
   │
   ▼
SSE stream: tool steps → result metadata (rows, vizType, citations) → narrative tokens
   │
   ▼
Persisted to Neon (chat history) · audited to Catalyst Data Store
```

**Retrieval is two independent subsystems.** Few-shot example selection for SQL generation uses
Gemini embeddings with cached vectors, falling back to an LLM picker when the embeddings API is
unavailable. Case citations use native Postgres `tsvector`/`ts_rank` full-text search with a
≥2-content-word overlap gate — this is what stops aggregate questions ("how many FIRs last
month") from surfacing spurious "related" cases that a raw score threshold would let through.

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
| Kannada localization | Full nav/chat UI in Kannada, questions accepted in either language |
| Voice + export | Speech in/out, conversation PDF export, CSV result export |
| Auth & history | PBKDF2-SHA512, HMAC-signed session cookie, per-user chat threads in Neon |

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

## Stack

Next.js 16 (App Router, standalone) · React 19 · Neon PostgreSQL + Prisma 7 · Mistral (agent,
SQL, narrative) · Gemini embeddings · Zoho Catalyst AppSail (hosting, Cache, Data Store, QuickML,
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
- Full-text retrieval, not vector search. The upgrade to pgvector touches one file —
  `lib/case-retrieval.ts` — because everything downstream is provider-agnostic.

## Why it matters

The value is not the chat box. It is that a station-level officer, with no analyst and no SQL,
can ask a question at 2am and get a cited, explainable, auditable answer — in Kannada if that's
the language they think in.
