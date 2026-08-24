# KhabriAI

**Karnataka Police Crime Intelligence Assistant**
Datathon 2026 — KSP × Hack2Skill Challenge 1

Conversational AI for investigators to query crime data in plain English. Sign in, ask a question → an **agent orchestrator** (Mistral `mistral-small-latest`) plans tool calls — SQL generation via RAG, full-text case search, precomputed anomaly insights, network/map data, QuickML risk prediction — and streams each step live to a **Case Board** in the chat, followed by an analyst narrative. Answers render as tables, charts, or network graphs, alongside a **Related Cases** panel citing real FIR narratives. Chat history is saved per user in Neon.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, standalone output) |
| Database | Neon PostgreSQL + Prisma |
| Auth | PBKDF2-SHA512 (100k iterations) · HMAC-signed session cookie (7 days) |
| Agent | Mistral `mistral-small-latest` orchestrator + 5 tools (see below) |
| LLM | Mistral (OpenAI-compatible API via the `openai` SDK) — `mistral-small-latest` for SQL, summary and narrative |
| Catalyst services | Cache (insights TTL) · Data Store (`AgentAuditLog`) · QuickML (chargesheet risk) — all optional, local fallbacks outside AppSail |
| Embeddings | Mistral (`mistral-embed`, 1024-dim) · LLM fallback for example selection |
| Case retrieval | Postgres full-text search (`tsvector`/`ts_rank`) over `CaseMaster.BriefFacts` |
| Proactive alerts | Scheduled detectors → per-officer `Alert` rows (Postgres unique dedupe) · header bell, 60s poll |
| Crew dossier | Two-hop walk over co-accused + pgvector MO edges (`lib/crew.ts`) · browser-print PDF briefing |
| Predictive hotspots | Least-squares trend per district × crime group over 6 complete months (`lib/hotspot-forecast.ts`) · patrol priorities · Catalyst Cache 180 min |
| Answer feedback | Thumbs-up/down per answer → reviewed correction becomes a few-shot example in Postgres (`LearnedExample`), merged into retrieval at query time (`lib/rag.ts`) |
| Audit trail | Every tool call and run to Postgres + Catalyst Data Store + local JSONL, with the officer and the scope it ran under (`lib/agent/audit-log.ts`) |
| Reviewer consoles | `/admin/feedback` and `/admin/audit` — HQ role required, narrowed by `ADMIN_EMAILS` (`lib/admin-auth.ts`) |
| Maps | Leaflet + react-leaflet — 30 hardcoded district centroids, not per-incident coordinates |
| Network graph | Cytoscape.js + cose-bilkent |
| Charts | Recharts |
| State | Zustand |
| Styling | Tailwind v4 + CSS custom properties |
| Deployment | Zoho AppSail |

---

## How it works

Every chat message runs through an agent loop (`lib/agent/orchestrator.ts`): a Mistral `mistral-small-latest` planner decides which tools to call (up to 4 iterations, first turn forced to call at least one tool so it can't answer from parametric memory), executes them in parallel, streams each step to the UI as it happens, then synthesizes a 2–4 sentence analyst narrative from the gathered results.

```
User question
     │
     ▼
Planner (llama-3.3-70b-versatile) ──► tool calls, streamed live to the Case Board
     │
     ├─ queryDatabase        RAG few-shot examples → qwen/qwen3.6-27b generates SQL
     │                       → validate (SELECT-only) → execute on Neon → classify viz
     ├─ searchRelatedCases   Postgres full-text search over FIR narratives → citations
     ├─ checkInsights        Precomputed anomalies (spikes, repeat accused, surges)
     ├─ getNetworkOrMapData  Accused-linkage graph / per-district case counts
     └─ predictRisk          Catalyst QuickML — chargesheet likelihood (AppSail only)
     │
     ▼
Stream: step events + metadata (rows, vizType, relatedCases) + narrative tokens (SSE)
     │
     ▼
Persist to ChatSession / ChatMessage · audit trail to Catalyst Data Store (AgentAuditLog)
```

Each tool call is fire-and-forget audited to a Catalyst Data Store table (`AgentAuditLog`) when running on AppSail — locally the writes are skipped and chat works without it.

Few-shot **example** retrieval (picking which Q→SQL pairs to show the SQL generator) runs on hosted APIs only (no local ONNX/HuggingFace). If `MISTRAL_API_KEY` is set it uses `mistral-embed` (1024-dim) with cached example vectors in `lib/rag-embeddings-cache.json`; otherwise it falls back to `mistral-small-latest` picking the best matching examples.

Force a mode with `RAG_MODE=embed` or `RAG_MODE=llm` in `.env`.

**Case** retrieval (the "Related Cases" citations panel) is a separate subsystem and does **not** use the embeddings API at all. Instead it uses Postgres native full-text search: see [Related Cases](#related-cases-citations) below.

SQL is generated and stored server-side but **not shown in the chat UI** — investigators see the narrative summary, table/chart/map, and CSV export only.

### Auto-visualization

| SQL pattern | Visualization |
|-------------|--------------|
| `GROUP BY … Accused … COUNT` | Network graph (Cytoscape.js) |
| `GROUP BY district/unit` | Bar chart |
| `GROUP BY date/month/week` | Line chart (Recharts) |
| Everything else | Data table |

Hotspot maps (Leaflet) live in the dedicated **Map** view, not in chat. They plot **district centroids sized by that district's case count**, not individual incidents — see [Predictive hotspots](#predictive-hotspots).

---

## Related Cases (citations)

Alongside the structured SQL answer, every question also runs a second, independent retrieval over real case narratives (`CaseMaster.BriefFacts`) and surfaces matching FIRs as clickable citations — a collapsed **Related Cases** dropdown under the assistant's reply (`▸ Related Cases · N`, expands to case cards, click a card to open the full case file in the same drawer used elsewhere in the app).

- **Retrieval**: `lib/case-retrieval.ts` — Postgres `to_tsvector`/`to_tsquery`/`ts_rank`, no pgvector, no external embedding call. Query terms are OR'd (not `plainto_tsquery`'s AND) so natural-language questions still match on partial overlap.
- **Precision gate**: raw `ts_rank` magnitude isn't reliable on its own — short documents mean generic words (e.g. "filed", "month") can coincidentally out-rank a real match. `findSimilarCases()` requires **≥2 literal content-word overlap** between the question and the narrative before a case counts as related; this is what actually filters out aggregate questions ("how many FIRs were filed last month") rather than a score threshold.
- **Corpus**: `CaseMaster.BriefFacts` is templated boilerplate out of `prisma/seed.ts` (e.g. *"Theft reported at station 42."*) — too generic to retrieve anything meaningful. Run `scripts/enrich-briefs.ts` after seeding to LLM-expand it into real 2–4 sentence FIR-style narratives (Mistral `mistral-small-latest`, batched + concurrent):
  ```bash
  npx tsx scripts/enrich-briefs.ts --limit=2000   # fast subset for a demo
  npx tsx scripts/enrich-briefs.ts                # full corpus (~20,000 cases)
  ```
  It's idempotent (only touches rows still matching the seed template) and safe to interrupt/rerun. Until it's run, the Related Cases panel will rarely show anything.
- **Why still full-text**: the same file already does pgvector `<=>` search for modus-operandi linking (`similarCasesTo`, `similarCasesToText`). Citations stay on full-text on purpose — the ≥2 content-word overlap gate is what stops an aggregate question ("how many FIRs last month") from surfacing spurious "related" cases, and a nearest-neighbour search always returns its five nearest, relevant or not. Swapping the citation path to embeddings is a change in `lib/case-retrieval.ts` alone; the chat route, SSE payload, frontend panel and chat-history persistence are already provider-agnostic.

---

## Proactive alerts

The insights panel is pull — it only exists while someone is looking at it. `lib/alerts.ts` is the push side: the same detectors run on a schedule and every finding is written as an `Alert` row for each officer whose scope it falls in, surfaced by the bell in the header.

**What fires** (`kind` on the row):

| kind | Detector | Severity |
|---|---|---|
| `spike` | District's last complete month vs the month before (`lib/insights-compute.ts`) | `critical` at ≥40% jump, else `warning` |
| `repeat_suspect` | Accused linked to 3+ cases in 30 days; statewide when they're active in more than one district | `warning` |
| `weekly_surge` | Crime group up >30% this week vs last, statewide | `critical` at ≥50%, else `warning` |
| `forecast` | Least-squares 6-month trend per district × crime group (`lib/forecast.ts`) | `info` |
| `mo_link` | **New** — cross-district modus-operandi linker (below) | `critical` |

**Cross-district MO linker.** One pgvector `LATERAL` nearest-neighbour lookup per recent case: it scans the 60 most recently registered embedded cases from the last `ALERT_MO_RECENT_DAYS` days, and for each one takes the single closest `CaseMaster.BriefFactsEmbedding` **in a different district**. Matches at or above `ALERT_MO_MIN_SCORE` become alerts (max 5 per run). Each match produces one finding routed to *both* districts, so the two stations that can't see each other's files both get it.

**Scope routing.** An SHO gets their own district's findings plus statewide ones (`districtId = null`); an HQ user gets everything — the same boundary the row-level-security policies draw around cases.

**Dedupe.** Every finding carries a stable key built from the district and the numbers behind it (`spike:<district>:<this>:<last>`, `mo:<caseId>:<matchId>`, …), stored as `dedupeKey` under a unique `(userId, dedupeKey)` index and inserted with `skipDuplicates`. Re-running the job is idempotent: an officer is re-notified only when the underlying numbers move.

**API routes:**

| Route | Purpose |
|---|---|
| `GET /api/alerts` | The officer's feed — unread first, newest first, plus `unread` and `last24h` counts |
| `PATCH /api/alerts` | Mark read — `{ ids: [...] }`, or every unread one when `ids` is omitted |
| `POST /api/alerts/generate` | Run detection now (session-authed) — what the bell's **Run detection** button calls |
| `GET /api/cron/alerts` | Scheduled target, `Bearer CRON_SECRET` |
| `GET /api/cron/insights` | Precomputes insights **and** fans the same findings out as alerts, so one job keeps both current |

**UI.** `components/alerts/AlertBell.tsx` — bell in the dashboard header, unread badge, 60s poll, a briefing header with the 24h count and a **Run detection** button. Clicking an alert marks it read and drops its `query` into the chat composer, so a finding becomes an investigation in one click.

**Run it manually:**
```bash
npm run alerts                 # generates, then prints what the first few officers would be pushed
```
Or open the bell and hit **Run detection** — same engine, behind a signed-in button, so a demo doesn't wait for the cron interval.

Tuning: `ALERT_MO_MIN_SCORE` (default `0.72`) and `ALERT_MO_RECENT_DAYS` (default `30`). The linker needs embeddings — run `npm run embed` first, otherwise only the anomaly and forecast detectors fire.

Schema: `model Alert` in `prisma/schema.prisma`, migration `prisma/migrations/20260825000000_alerts`.

---

## Crew dossier

An MO link answers *what else looks like this*. A dossier answers the next three questions — **who** is behind it, **where** has it run, **what** is already done. `lib/crew.ts` walks outward from one seed (a case or a person) for two hops along two kinds of edge and returns the connected component as a briefing: members, case timeline, districts crossed, the recurring phrases in the narratives, and the stage each case is at.

**The two edges:**

| Edge | What it is | How it is followed |
|---|---|---|
| `co-accused` | People named in the same FIR — a fact from the file, not an inference | Every person on a frontier case, then **their** other cases |
| `mo` | pgvector nearest narratives (`CaseMaster.BriefFactsEmbedding`, one indexed `LATERAL` pass per hop) | Only from cases already on the method chain — the seed, or an earlier MO hit |

**Why co-accused hops are crime-group-restricted.** A co-offender's other cases are filtered to the `CrimeMajorHeadID` values the seed cases belong to. Without it a prolific offender drags in every accident and dowry case they were ever named in, and the dossier stops describing a series and starts describing one person's whole record.

**Why MO is followed only from the method chain.** Chasing narratives out of every co-offender's case turns a series into a survey of the whole state, so the similarity edge stays on the chain that started at the seed.

**Caps.** 40 cases, 25 members, `hops: 2`, `moTopK: 4`, `moMinScore` default `0.78` (`CREW_MO_MIN_SCORE`). The cap is a budget spent on the strongest evidence first — MO hits by score, then co-accused cases newest first — and when a cap stops the walk the dossier is returned with `truncated: true` rather than silently trimmed. Every case carries **how it was reached** (`link: seed | co-accused | mo`, plus `linkedFrom` and `linkScore` for an MO edge), so nothing in the briefing is an unexplained assertion.

**Signature.** `extractSignature()` counts word shingles (12 down to 4 words) across the dossier's narratives, never running a phrase across a clause boundary, keeps only phrases that recur in several separate files, and keeps the longest form of each — the crew's habit in the FIRs' own words.

The whole walk runs through `scopedClient(districtId)`, so an SHO's dossier is built from the cases row-level security lets them see.

**API:**

| Route | Purpose |
|---|---|
| `GET /api/crew?caseId=13778` | Seed from a `CaseMasterID` |
| `GET /api/crew?crimeNo=…` | Seed from the 18-digit CrimeNo an officer actually has in front of them |
| `GET /api/crew?personId=KSP-P-00928` | Seed from a person — every case they are named in becomes the seed set |

Session-guarded (`requireUser`) and scope-aware (`getScope`); `400` when no seed is given, `404` for an unknown CrimeNo or a seed that is not in scope.

**Agent tool.** `buildCrewDossier` (`lib/agent/tools.ts`) takes `crimeNo`, `caseId`, `personName` or `personId`. A CrimeNo is resolved to an id inside the caller's scope; a name is resolved to a `PersonID` with an exact match preferred over the substring hits it dragged in — if several different people still match, the tool refuses and asks the officer to disambiguate (`ambiguousPerson` with examples), and if none match it returns near-miss name suggestions rather than rewriting the name silently. Brief facts are stripped before the dossier goes back to the planner (the recurring detail is already distilled into `signature`), and one row per member is returned for the table viz. The orchestrator treats that member list as evidence: it wins the visualization over a similar-cases result.

**UI.** Two entry points:
- **Crew** nav item in the dashboard (`components/views/CrewView.tsx`) — type a seed; digits are read as a case id, anything else as a PersonID.
- **Build crew dossier** button in the Case File drawer (`components/viz/CaseDrawer.tsx`), under the Similar Modus Operandi list — one MO hit is a lead, the walk is the series behind it.

Both render `components/crew/CrewDossier.tsx` (inline in the view, floating over the drawer). Clicking a case in the timeline opens its full case file.

**PDF export.** The **↓ PDF** button calls `window.print()`; a print-only `.print-root` renders the dossier as sections — summary, signature, members, case timeline with the link that brought each case in — using the print rules in `app/globals.css`. Same browser-print route as the chat transcript, so a dossier reaches a case file as paper without a PDF dependency.

**Run it without the UI:**
```bash
npm run crew -- --case 13778           # seed from a CaseMasterID
npm run crew -- --person KSP-P-00928   # seed from a PersonID
```
Prints the summary line, districts, signature, members and the case timeline with `[mo 0.93 ← 13778]`-style provenance on every row, plus how many MO links cross a district boundary. `npm test` covers the signature extractor (`test/crew.test.ts`).

---

## Predictive hotspots

The map answers *where has crime happened*. An officer allocating tomorrow's shift needs *where is it going*. `lib/hotspot-forecast.ts` fits the same transparent least-squares trend the early-warning insights use — one line per **district × crime group** over the last **six complete months** — and projects one month ahead, scaled to the requested horizon (`scale = horizonDays / 30`).

**Why the current month is excluded.** The month now running is always partial: on the 4th it holds four days of cases. Including it in the fit bends every trend downwards and would show a statewide decline that is an artefact of the calendar. So the window ends at last month, and the projection is *for* the month now running.

**Confidence and fit, per cell.** `fitTrend(y)` returns `slope`, `intercept` and the **R²** — how much of the variance the line actually explains — and every cell carries a `low` / `medium` / `high` confidence derived from both case volume and R²: `high` needs a fit ≥ 0.6 on ≥ 24 cases, `medium` a fit ≥ 0.3, and anything under 12 cases of history is `low` regardless of how neat the line looks. The UI never shows a projected number without saying how much to trust it.

**Why district, not station.** 20,000 cases across 210 stations is about **95 cases per station over the whole corpus** — split further by crime group and by month, a station-level series is mostly zeros and ones. A trend line through that is noise wearing a slope, and a confident line through noise is worse than no line at all. So the forecast stops at the district.

**How stations are named instead.** Districts do not patrol; stations do. Each priority therefore names the top three stations by their **share of that district's last 90 days** in that crime group — an observed fact, not a projection. That is what turns "Burglary is rising in Tumakuru" into a patrol order.

**Patrol priorities.** A cell becomes a priority only when all three hold: slope > **0.5** cases/month, ≥ **12** cases of history, and predicted > observed. They are then ranked by `(predicted − observed) × max(fit, 0.05)` — the uplift a shift would absorb, **discounted by how well the line fits**. Without the discount the top of the list fills with thin cells where a jump from 1 case to 8 is arithmetic, not a trend. Top 12 are returned.

**API.**

| Route | Purpose |
|---|---|
| `GET /api/forecast/hotspots?horizon=30` | Per-district forecast + ranked patrol priorities. `horizon` clamped to **7–90** days |

Session-guarded (`requireUser`), Catalyst Cache-backed for **180 minutes** (the fit only moves when a month closes, so recomputing per page load buys nothing), and scoped: a district-posted officer gets only their own district's rows and priorities, re-ranked from 1, with the scope name echoed back.

**Agent tool.** `predictHotspots` (`lib/agent/tools.ts`, dispatched in `lib/agent/orchestrator.ts`) takes `district`, `crimeGroup` and `horizonDays` (7–90). The officer's posting bounds the answer the way it bounds their SQL — an unnamed district defaults to their own. It returns the ranked rows as a table plus the `method` string, so the narrative repeats how the number was produced. Forward-looking questions ("where should we patrol next month?") route here; what already happened stays with `queryDatabase`.

**UI.** `components/views/MapView.tsx` carries an **Observed | Predicted** layer toggle. The forecast is fetched lazily — the observed layer never pays for it — and only on first switch. Predicted pins ride an **amber→red ramp** rather than the observed layer's reds, so a projection can never be misread as a count; each popup shows `observed → predicted` with the confidence chip and the crime groups driving it. **Patrol priorities →** opens `components/views/PatrolPriorities.tsx`: rank, district × crime group, observed→predicted, slope/month, fit, the station shares, and the plain-English reason. The method, the months fitted, and the district/station caveats are printed **as text under the numbers, not hidden in a tooltip** — this is a police tool, so a projection should be arguable rather than obeyed.

**Run it without the UI:**
```bash
npm run hotspots     # scripts/hotspot-check.ts — districts, months fitted, top priorities
```
One run on the synthetic corpus: 30 districts and 12 patrol priorities in ~1.3 s. Top priority was Crimes Against Women in Chikkaballapura — 1 case in the last 30 days against 7 projected, +0.91/month, **medium** confidence, with 77% of the last 90 days sitting at Chikkaballapura City PS (44%), North PS (22%) and Market PS (11%). The highest-confidence cell was Crimes Against Body in Dakshina Kannada, 7 → 11 at +1.23/month with a fit of 0.68. That is one run on seeded data, not an evaluation.

`npm test` covers the estimator itself (`test/hotspot-forecast.test.ts`): exact slope/intercept recovery on a straight line, a flat series reporting no trend and nothing explained, a falling trend kept negative, a zig-zag scoring a poor fit, and the one-step projection.

---

## Answer feedback and self-improving retrieval

The weakest joint in the pipeline is the few-shot bank behind SQL generation — 25 seeded question → SQL pairs in `lib/rag-examples.json`. When it got a question wrong, fixing it meant editing that file and redeploying. Now it means a review.

**Capturing the verdict.** A thumbs-up / thumbs-down pair sits under every assistant answer (`components/chat/MessageBubble.tsx`), and a thumbs-down opens a short *what was wrong* box. The client posts the whole exchange — the question read back out of the transcript, the answer, the SQL that was generated, and the tool names snapshotted off the Case Board when the run finished (`components/chat/ChatWindow.tsx`) — because a vote on its own is a number nobody can act on. The client sends it rather than the server joining it back: chat messages are re-keyed when they are persisted (`createMany` in `app/api/chats/[id]/route.ts`), so the id the browser holds is not a database id. It survives only as a dedupe key — `AnswerFeedback` is unique on `(userId, messageId)` and a repeat vote upserts, so changing your mind replaces the verdict instead of adding a second one. The vote and the tool list are deliberately client-only state (`store/chat.ts`); neither is written to chat history.

**The review gate.** The queue at `/admin/feedback` shows unreviewed first, each row carrying the question, what the pipeline replied, which tools ran, the SQL it generated and the officer's comment — because the decision is "was this the right query", and that cannot be made from a vote. Approving requires the SQL the answer *should* have used. That SQL goes through the same SELECT-only AST validator the model's own output does (`lib/sql-validator.ts`) **and is executed once** under the standard `LIMIT 500` and 8 s `statement_timeout`; if it does not run, the approval is refused with the database's error. A few-shot example is model input, and one that does not execute would teach the wrong shape to every question that later retrieves it.

**Where a correction lives.** Approved pairs become `LearnedExample` rows in Postgres rather than being written back into `lib/rag-examples.json` — that file is read-only once the app is packaged for AppSail. The question is embedded with `mistral-embed` at approval time, and the active bank (200 most recent) is cached for 60 s, so retrieval never pays for an embedding call it can avoid. An approved correction therefore changes the next answer without a redeploy.

**Merging into retrieval.** `findSimilar` (`lib/rag.ts`) scores both banks and hands them to the pure, unit-tested `mergeExamples`:

- when the seeded side came from embeddings, both sides are cosine over the same model — so they are one ranking, deduplicated by question and cut to top-K;
- when embeddings are unavailable and the seeded side came from the LLM picker, the two scales are not comparable. Rather than pretend they are, exactly one learned example is admitted — the best — and only above a word-overlap floor of **0.3**. Otherwise an overlap score would either never survive next to the picker's near-1.0 ranks, or would gatecrash on a weak match.

**The eval number is insulated from all of this.** When `findSimilar` is called with `excludeIndex`, the evaluation harness is running a holdout: it is measuring the seeded bank against its own gold SQL. Learned examples are skipped entirely on that path, so the accuracy figure keeps measuring how well the system generalises rather than how much it has been corrected.

**API.**

| Route | Purpose |
|---|---|
| `POST /api/feedback` | One officer's verdict on one answer, with the exchange attached. Session-guarded |
| `GET /api/admin/feedback` | The review queue — `?status=new\|approved\|rejected\|all`, `?vote=up\|down` |
| `PATCH /api/admin/feedback` | `{ id, action: "approve" \| "reject", correctedSql }` — validates, executes, then stores the example |
| `GET /api/admin/feedback/stats?days=30` | Totals, the daily satisfaction line, the cumulative learned-example count, and which tools appear most often on a thumbs-down |

**Console.** `/admin/feedback`, reached from the **profile popover on the dashboard** — reviewing answers is a governance job, not an investigator one, so it stays out of the nav. `components/admin/AccuracyChart.tsx` plots satisfaction % against the cumulative learned bank on a second axis (the noisy line and the monotonic one need separate axes to share a frame); `components/admin/ReviewQueue.tsx` is the queue itself. Both consoles are gated by `lib/admin-auth.ts`: HQ role required — an SHO gets a 403 — optionally narrowed further by `ADMIN_EMAILS`. The same 403 comes back whether the caller is signed out or merely not a reviewer, so probing the URL tells you nothing.

**Run it without the UI:**
```bash
npm run feedback     # scripts/feedback-check.ts — vote → review → retrieval, end to end
```
One run on the synthetic corpus: a thumbs-down was recorded, the reviewer's corrected SQL passed the validator and executed (5 rows), was embedded, and the same question then retrieved that corrected example at score **1.000** — above the seeded examples that had previously scored 0.867 / 0.863 / 0.854. That is one run on seeded data, not an evaluation.

`npm test` covers the merge rule itself (`test/rag-merge.test.ts`): an empty learned bank leaving the seeded ranking untouched, a stronger correction taking the top slot, a weaker one ranking where it belongs, no question appearing twice, and — on incomparable scales — one clearly relevant example admitted while a weak overlap is ignored entirely.

---

## Audit trail

Every tool call the agent makes was already being written down. The problem was where: a JSONL file next to the process and a Catalyst Data Store table — neither queryable from the app, and neither recording **who** asked or **under what scope** their query ran. An audit trail nobody can read is not an audit trail.

**Three sinks, three readers** (`lib/agent/audit-log.ts`):

| Sink | Why it exists |
|---|---|
| Postgres (`AgentAuditLog`) | The one the app can query — what `/admin/audit` reads. Records the officer and the scope the query actually ran under |
| Catalyst Data Store | Off-box copy: an operator who can edit the application database cannot quietly edit this one. Needs a manually created `AgentAuditLog` table in the Catalyst console |
| Local JSONL (`.audit/agent-audit.jsonl`) | Works on a laptop with no Catalyst, and — more usefully — still works when the database is the thing that broke |

All three are fire-and-forget (`Promise.allSettled`, failures logged and swallowed): an audit write must never fail a query an officer is waiting on, and must never throw into the streaming response.

**What a row holds.** Two event types share the table. A `step` row is one tool call — tool name, arguments, result, `ok`/`error`, the row count it returned and its duration. A `run` row closes the question — tool-call count, the final narrative, and the wall-clock time of the whole run (`lib/agent/orchestrator.ts` times both). Arguments are truncated at 2,000 characters, results at 4,000 and the final answer at 8,000, and the stored string **says so** (`… [truncated N chars]`) — enough to audit, not a second copy of the case database, and never a truncated result a reviewer could mistake for a whole one.

**Who asked.** `Scope` (`lib/chat-auth.ts`) now carries `userId` and `email` alongside the role and district, and the orchestrator attaches that actor to every audit write. `AgentAuditLog` has **no foreign key to `KhabriUser`, on purpose**: deleting an account must not erase the record of what was asked under it, so the email and role are copied onto the row instead.

**Reading it back** (`lib/audit.ts`). `listAuditRuns` groups by run, not by tool call — the unit a reviewer is accountable for is one question, so matching runs are found first and their steps fetched by `runId`. A filter on a tool therefore still returns the whole run it belonged to, including the question that produced the call. The filters are the ones a real review starts from: officer, tool, scope, `ok`/`error`, free text over the question, and a day window. `auditSummary` gives volume, failures, distinct officers, median run latency, per-tool median latency, and the distinct scopes seen.

**API.**

| Route | Purpose |
|---|---|
| `GET /api/admin/audit` | Runs with their steps attached — `?officer=`, `?tool=`, `?scope=` (a district name, or `statewide`), `?status=ok\|error`, `?q=`, `?days=`, `?limit=` |
| `GET /api/admin/audit/summary?days=30` | Volume, failures, officers, median run latency, per-tool latency, and the filter vocabulary |

Both are reviewer-gated the same way the feedback console is — these rows carry other officers' questions, which can name real people.

**Console.** `/admin/audit`, also reached from the profile popover on the dashboard. Runs expand to their tool calls with per-call status, row counts and timings; `components/admin/ToolLatencyTable.tsx` ranks tools by median latency and flags a *rate* of failures rather than a count (two errors in three calls is a broken tool; two in two thousand is a bad afternoon). A district-bound scope is rendered visually distinct from Statewide — dashed khaki against solid blue (`ScopeBadge` in `components/admin/AuditRunList.tsx`) — because what the officer was *allowed* to see is the accountability point, not a footnote.

**Run it without the UI:**
```bash
npm run audit -- "how many FIRs were filed in Mysuru last month?"
```
It asks a real agent question, waits for the fire-and-forget writes to land, then prints the trail back the way the console reads it. One run on the synthetic corpus captured 4 real agent runs: 4 runs / 4 tool calls / 0 failures / median run 6,621 ms, with `queryDatabase` at 3 calls, median 3,603 ms, and `findSimilarCases` at 1 call, 1,226 ms. That is one run on seeded data, not an evaluation.

`npm test` covers the truncation and row-count helpers (`test/audit-log.test.ts`).

**Growth.** Nothing prunes `AgentAuditLog` yet. It gains one row per tool call plus one per question and grows monotonically; the indexes on `createdAt`, `runId`, `(userId, createdAt)` and `(tool, createdAt)` keep the console fast, but a retention job or a partition strategy is still owed before sustained real-world use.

---

## Setup

### 1. Install dependencies
```bash
npm install
```
`postinstall` runs `prisma generate` automatically.

### 2. Configure environment
Create `.env` (or `.env.local`):
```env
DATABASE_URL=your_neon_connection_string
MISTRAL_API_KEY=your_mistral_key
```

### 3. Push schema + seed data
```bash
npx prisma db push
npx prisma db seed
```

Seed generates: 1 state · 30 districts · 210 police stations · 20,000 FIR cases (calibrated to NCRB Karnataka proportions) · victims, accused, arrests, chargesheets. Takes ~3–5 minutes.

### 4. Enrich case narratives (optional, for Related Cases citations)
```bash
npx tsx scripts/enrich-briefs.ts --limit=2000
```
Seed data's `BriefFacts` is templated boilerplate — this LLM-expands a subset (or the full corpus, omit `--limit`) into real narratives so the [Related Cases](#related-cases-citations) panel has something to retrieve. Skippable if you don't need citations for a quick run.

### 5. Start dev server
```bash
npm run dev
```
Open **http://localhost:3000** → sign up or log in → dashboard.

---

## Auth & chat history

- **Sign up / log in** at `/signup` and `/login`. Credentials are hashed with PBKDF2-SHA512 and stored in `KhabriUser`.
- **Session** is an HMAC-SHA256-signed cookie (`khabri_session`, 7-day expiry, `lib/session.ts`). Set `SESSION_SECRET` in production — without it a dev fallback secret is used (with a console warning).
- **Log out** via `POST /api/auth/logout` (clears the cookie).
- **Chat history** is stored in Neon (`ChatSession`, `ChatMessage`) and listed in the sidebar under **Recent chats**.
- **New chat** starts a fresh thread; the first message auto-titles the session.
- API routes resolve the user from the session cookie (`lib/chat-auth.ts`).

### Neon Auth: Google and email one-time codes

Identity is handled by **Neon Auth** (managed Better Auth, enabled on the project's Neon branch): **Continue with Google** uses
Neon's shared OAuth credentials (no Google Cloud project needed), and **Email me a code** signs in with a 6-digit one-time
code sent by Neon's shared email provider. The app keeps its own `KhabriUser` row (role, district → RLS scope) and its own
`khabri_session` cookie: after a Neon sign-in, `POST /api/auth/bridge` finds-or-creates the user by email and issues the
session exactly like the password login. Both options are also on `/signup`: the Posting / District chosen there is carried through the Google
redirect (sessionStorage) and applied when the account is first created; a later sign-in never changes an existing
officer's posting. Accounts created from `/login` start as HQ (statewide); give them a district with `npm run set-scope`. The password login/signup routes remain for scripted and legacy accounts.

```
NEON_AUTH_URL=https://<endpoint-id>.neonauth.<region>.aws.neon.tech/neondb/auth   # Neon Console → Branch → Auth ("Auth URL"; NEON_AUTH_BASE_URL also accepted)
NEON_AUTH_COOKIE_SECRET=<32+ random chars>
```

Files: `lib/neon-auth-server.ts` (edge-safe instance), `lib/neon-auth.ts` (bridge), `app/api/auth/[...path]/route.ts` (API proxy),
`proxy.ts` (Next middleware: exchanges the `?neon_auth_session_verifier` Google returns with for the Neon session cookie, then
sends the user to `/auth/callback`), `lib/auth-client.ts`, `app/auth/callback/page.tsx` (Google return URL — add `http://localhost:3000` and the AppSail URL as trusted origins in the
Neon Console). Without `NEON_AUTH_BASE_URL` the Neon buttons return a clear error and the password form still works.

---

## Accuracy eval

`lib/rag-examples.json` holds 94 question → gold-SQL pairs (84 English, 10 Kannada) covering counts, trends, joins across accused/victims/arrests/chargesheets/sections, and abbreviation traps (BLR, dowry death → 304B). The eval runs each question through the **same pipeline the agent uses** (`lib/text-to-sql.ts`: retrieve few-shot → generate → validate → execute under guards → repair once on DB error) and reports two numbers separately:

| metric | meaning |
|---|---|
| **executes** | generated SQL ran without error — this is what the old eval called "accuracy" |
| **matches** | result set equals the gold SQL's result set (Spider-style execution match: value-only, order-insensitive, numbers at 2-dp, row lists compared on the set of `CaseMasterID`s) — **this is accuracy** |

```bash
npm run eval -- --holdout              # honest number: each question's own example is excluded from retrieval
npm run eval -- --holdout --no-repair  # ablation: same, without the error-feedback retry
npm run eval -- --limit=10             # quick smoke
```

Every run writes `eval/results/<timestamp>.json` with per-question SQL, verdict, repair flag and latency. Output: `.` match · `x` ran but wrong result · `E` error.

Unit tests for the guards, the repair loop, the comparator and entity resolution: `npm test`.

### Role-based scope

Users are `HQ` (statewide) or `SHO` (one district), chosen at signup or set with
`npm run set-scope -- --email=<email> --district=Mysuru` (`--hq` to reset). Enforcement is Postgres
row-level security (`prisma/migrations/*_role_scope_rls`, `*_scope_role`): `lib/db.ts withScope()` runs a
scoped officer's queries as the non-owner role `khabri_scoped` with `app.district_id` set, and the
policies on `CaseMaster` + child tables filter every row. All data routes use `scopedDb(req)` from
`lib/chat-auth.ts`; the chat pipeline passes the district into `runGuardedQuery`. Unset scope = no
restriction, so scripts and migrations are unaffected. `test/scope.test.ts` asserts the policies bite. The precomputed
Intelligence Briefing (`/api/insights`) is a statewide command view by design and is not scoped.

### Demo readiness

```bash
npm run shift-dates -- --apply   # move the synthetic corpus so the newest FIR is yesterday (dates, CrimeNo year, narrative text, insights)
npm run demo:check               # assert the anchors in docs/DEMO.md still hold
npm run loadtest -- --concurrency=5 --rounds=2   # p50/p95 time-to-first-token against a running instance (--base=URL for AppSail)
```

The 3-minute script with exact questions and expected outcomes is in [docs/DEMO.md](docs/DEMO.md).

### Modus-operandi linking

```bash
npm run enrich            # LLM-expand templated BriefFacts into narratives (MO series for repeat offenders)
npm run embed             # embed narratives into CaseMaster.BriefFactsEmbedding (pgvector, mistral-embed 1024-d)
npm run eval:similarity   # type@5 / group@5 / series recall@5 / cross-district share
```

After changing `lib/mo-signature.ts`, regenerate with `npm run enrich -- --all` (resumable; chunk it with `--limit=2400` on rate-limited tiers) and then `npm run embed -- --force`.

`lib/case-retrieval.ts` exposes `similarCasesTo(caseId)` and `similarCasesToText(description)`; the agent tool `findSimilarCases` and `GET /api/case/similar?id=` (Case Drawer panel) sit on top. Mistral free/low tiers rate-limit at ~3 concurrent chat calls: set `ENRICH_CONCURRENCY=3` if `npm run enrich` logs 429s, and re-run it — failed batches stay templated and are retried.

### Entity resolution & clarification

`lib/entity-resolve.ts` checks district / station / crime-type literals in generated SQL against the real vocabulary (in-memory trigram similarity + an alias table for legacy names such as Bangalore, Mysore, Belgaum, Gulbarga, Tumkur) and rewrites near-misses; the Case Board shows the correction. Person names are never rewritten: a zero-row person query returns `suggestions` (closest real names), and a bare first name matching many people returns `ambiguousPerson` with no rows. The orchestrator has an `askClarification` tool that ends the turn with a question instead of a query. The previous turn's SQL is appended to assistant history (`[SQL used: …]`) so follow-ups refine it.

---

## Project structure

```
app/
  (auth)/login/     Login page
  (auth)/signup/    Sign up page
  dashboard/        Main app shell (sidebar, chat, map, network, crew, reports, about)
  admin/feedback/   Reviewer console — accuracy chart + review queue
  admin/audit/      Audit viewer — runs, tool calls, scope badges, tool latency
  api/
    auth/login/       Credential check → sets session cookie
    auth/google/      Google ID-token check → find-or-create user, sets session cookie
    auth/logout/      Clears session cookie
    auth/signup/      User registration
    chats/            List / create chat sessions
    chats/[id]/       Load, append messages, delete session
    chat/             SSE — agent loop: tool steps + metadata + streaming narrative
    insights/         Anomaly insight cards (Catalyst Cache-backed)
    alerts/           Alert feed (GET) + mark read (PATCH)
    alerts/generate/  Run detection now (signed-in "Run detection" button)
    crew/             Crew dossier around a case (caseId/crimeNo) or a person (personId)
    forecast/hotspots/  Predictive hotspots + patrol priorities (?horizon=7-90, cached 180 min)
    cron/insights/    Precompute target for scheduled insight refresh (also fans out alerts)
    cron/alerts/      Scheduled target for the alert engine (Bearer CRON_SECRET)
    cron/register/    Registers the Catalyst cron that calls the two above
    map-data/         Per-district case counts (plotted against hardcoded district centroids)
    network-data/     Accused co-occurrence graph
    reports/          Pre-aggregated insight cards
    feedback/         Records one officer's thumbs-up/down on one answer (session-guarded)
    admin/feedback/   Review queue (GET) + approve/reject a correction (PATCH) — reviewer-gated
    admin/feedback/stats/  Satisfaction line, learned-example count, thumbs-down weak spots
    admin/audit/      Audit trail grouped by run, with filters
    admin/audit/summary/   Volume, failures, officers, per-tool median latency
components/
  chat/             ChatWindow, MessageBubble (answer feedback), CaseBoard (live tool steps), RelatedCases, ChatHistory
  admin/            AccuracyChart, ReviewQueue, AuditRunList, ToolLatencyTable
  views/            Map, Network, Crew, Reports, About panels
    MapView.tsx         District-centroid hotspot map + Observed | Predicted layer toggle
    PatrolPriorities.tsx  Ranked patrol priorities panel — fit, confidence, station shares, method
  crew/             CrewDossier — dossier panel + print-only PDF rendering
  viz/              NetworkGraph, ResultsTable, CrimeChart, CaseDrawer
lib/
  agent/
    orchestrator.ts   Agent loop — Mistral planner, tool execution, SSE event stream
    tools.ts          5 tool implementations + JSON schemas
    audit-log.ts      Fire-and-forget audit trail — Postgres + Catalyst Data Store + local JSONL, with actor and scope
  rag.ts                RAG router (embeddings → LLM fallback) — few-shot SQL examples only, seeded + learned merged
  feedback.ts           Vote capture, review queue, the approval gate (validate + execute), stats
  learned-examples.ts   Approved corrections as few-shot examples — embedded, cached 60s
  audit.ts              Reading the audit trail — runs with their steps, and the summary
  admin-auth.ts         Reviewer gate for both consoles (HQ role + ADMIN_EMAILS)
  embeddings.ts         Mistral embeddings (mistral-embed, 1024-dim) + on-disk cache
  rag-llm.ts            LLM example-selection fallback
  mistral-client.ts     Shared Mistral client (openai SDK, Mistral base URL)
  rag-keywords.ts       Keyword Jaccard (eval baseline only)
  rag-examples.json 25 Q→SQL pairs (the RAG knowledge base)
  case-retrieval.ts Related Cases retrieval — Postgres full-text search over BriefFacts
  llm.ts            generateSQL() + streamSummary() via Mistral
  prompt-builder.ts KSP database schema (injected into every prompt)
  sql-validator.ts  SELECT-only guard, multi-statement block
  query-classifier.ts  SQL → vizType (table / chart / graph)
  insights-compute.ts  The 3 anomaly-detection queries (spikes, repeat accused, surges)
  alerts.ts            Alert engine — detectors + cross-district MO linker, scope fan-out, dedupe
  crew.ts              Crew dossier — two-hop co-accused + MO walk, caps, signature extraction
  hotspot-forecast.ts  Predictive hotspots — least-squares trend per district × crime group, patrol priorities
  insights-cache.ts    Insight cache keys/TTL over catalyst-cache
  catalyst-client.ts   Request-scoped Catalyst SDK init + timeout guard (null outside AppSail)
  catalyst-cache.ts    Catalyst Cache get/set with local fallback
  session.ts        HMAC-signed session cookie create/verify
  chat-auth.ts      Resolve user from session cookie
  chat-api.ts       Client helpers for chat API calls
  db.ts             Prisma client (pg adapter)
store/
  chat.ts           Zustand — messages, Case Board steps, active session, session list
prisma/
  schema.prisma     KSP FIR schema + KhabriUser + ChatSession + ChatMessage + AnswerFeedback + LearnedExample + AgentAuditLog
  seed.ts           20,000 synthetic KSP-calibrated FIR records
  migrations/       …_add_case_fts — GIN full-text index on BriefFacts + ChatMessage.relatedCases
test/
  crew.test.ts      Signature extractor — recurrence, longest form, clause boundaries
  rag-merge.test.ts  mergeExamples — seeded vs learned ranking, dedupe, the overlap floor
  audit-log.test.ts  Truncation that states itself, and the row count taken from a result
  hotspot-forecast.test.ts  fitTrend — slope/intercept recovery, R² behaviour, projection
eval/
  run.ts            Offline accuracy harness
scripts/
  prepare-standalone.mjs  Copies static/public/rag-examples.json + .env into the AppSail bundle, dereferences symlinks
  enrich-briefs.ts        LLM-expands templated BriefFacts into real FIR narratives
  crew-check.ts           Prints a dossier for a seed without the UI (`npm run crew`)
  hotspot-check.ts        Prints the forecast and patrol priorities without the map (`npm run hotspots`)
  feedback-check.ts       Vote → review → retrieval, end to end (`npm run feedback`)
  audit-check.ts          Runs one real agent question and reads the trail back (`npm run audit`)
```

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `MISTRAL_API_KEY` | Yes | Mistral API key |
| `MISTRAL_SQL_MODEL` | No | SQL model (default `mistral-large-latest`) |
| `MISTRAL_EMBED_MODEL` | No | Embedding model (default `mistral-embed`); embeddings use `MISTRAL_API_KEY` |
| `MISTRAL_RAG_MODEL` | No | LLM example-picker fallback (default `mistral-small-latest`) |
| `RAG_MODE` | No | `embed` or `llm` to force retrieval mode |
| `MISTRAL_SUMMARY_MODEL` | No | Summary model (default `mistral-small-latest`) |
| `MISTRAL_ORCH_MODEL` | No | Agent orchestrator model (default `mistral-large-latest`) |
| `SESSION_SECRET` | Prod | HMAC key for session cookies — required in production |
| `CATALYST_AUTOML_MODEL_ID` | No | QuickML model ID for the `predictRisk` tool (AppSail only) |
| `CRON_SECRET` | No | Bearer token guarding `/api/cron/insights` precompute and `/api/cron/alerts` |
| `ALERT_MO_MIN_SCORE` | No | Minimum cosine similarity for a cross-district MO alert (default `0.72`) |
| `ALERT_MO_RECENT_DAYS` | No | How far back the MO linker looks for newly registered cases (default `30`) |
| `CREW_MO_MIN_SCORE` | No | Minimum cosine similarity for a modus-operandi edge in the crew dossier walk (default `0.78`) |
| `CATALYST_CRON_NAME` | No | Name of the registered Catalyst cron (default `khabri-alerts`) |
| `CATALYST_JOBPOOL_NAME` | No | Job pool the scheduled job is submitted to (default `khabri-jobs`) |
| `CATALYST_CRON_EVERY_HOURS` | No | Interval in hours (default `3`) |
| `CATALYST_CRON_TARGET` | No | `webhook` (default) or `appsail` — how the job pool reaches the app |
| `CATALYST_APPSAIL_NAME` | No | AppSail service name when `CATALYST_CRON_TARGET=appsail` (default `khabriai`) |
| `CATALYST_APP_URL` | No | Public origin the job pool calls; derived from the request when unset |
| `ADMIN_EMAILS` | No | Comma-separated allow-list for the two reviewer consoles (`/admin/feedback`, `/admin/audit`). Unset means any HQ account gets in — and every account created from `/login` defaults to HQ, so on a real deployment this list is the gate |

---

## Cloud deploy — Catalyst AppSail

```bash
catalyst deploy
```

The `predeploy` hook runs `next build`, prepares the standalone bundle, and uploads it. The standalone output in `.next/standalone` is what AppSail serves (~170 MB). Catalyst rejects uploads over **250 MB** (HTTP 413).

**AppSail env vars to set:**
- `DATABASE_URL`, `MISTRAL_API_KEY`, `SESSION_SECRET`
- Optional: `CATALYST_AUTOML_MODEL_ID` (QuickML risk tool), `CRON_SECRET` (insights precompute + alerts), `ALERT_MO_MIN_SCORE` / `ALERT_MO_RECENT_DAYS` (MO-link alert tuning)

**Optional Catalyst console setup** (features degrade gracefully without them):
- Data Store table `AgentAuditLog` — agent audit trail (columns per `lib/agent/audit-log.ts`)
- QuickML classifier — enables the `predictRisk` tool
- Job Scheduling — the schedule that drives proactive alerts, see below

### Scheduling the alert job

Catalyst has no declarative cron config — a cron is either drawn in the console or created at runtime through the SDK as a *dynamic* cron. The app registers its own, so the schedule is part of the deployment instead of a click-path someone has to remember (`lib/catalyst-cron.ts`).

**Prerequisite (console, once):** Job Scheduling → create a job pool named `khabri-jobs` of type **Webhook** (or **AppSail**, if you set `CATALYST_CRON_TARGET=appsail`).

Then, after `catalyst deploy`, with `CRON_SECRET` set in the AppSail env:

```bash
# register the schedule (idempotent — an existing cron of the same name is left alone)
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<your-appsail-url>/api/cron/register

# check what is registered
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-appsail-url>/api/cron/register

# change the interval or target URL, then fire it once to prove it
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://<your-appsail-url>/api/cron/register?force=true&run=true"
```

It creates a `Periodic` cron (every `CATALYST_CRON_EVERY_HOURS`, Asia/Kolkata) whose job is a webhook back into this app: `GET /api/cron/insights` with the `CRON_SECRET` bearer, 2 retries 15 min apart. That route refreshes the insight cache **and** fans the findings out as per-officer alerts. `/api/cron/alerts` is the same engine without the cache refresh, if you'd rather schedule the two separately.

The route is gated on `CRON_SECRET` (creating platform infrastructure is not something a session cookie should be able to do) and returns `503` with a clear message when called outside AppSail, where the Catalyst SDK cannot initialize.

Memory: `app-config.json` requests 1024 MB. Lower to 512 if your plan rejects it.

---

## Demo script

```
1. Sign in and open Intelligence Chat

2. "Show me Crimes Against Property in Bengaluru Urban in the last 6 months"
   → table with case numbers, police stations, crime sub-heads

3. "Break that down by month"
   → line chart (context retention across turns)

4. "Which accused have more than 2 cases in the last 30 days?"
   → network graph

5. Open the Map view from the sidebar
   → Leaflet hotspot map: Karnataka's 30 districts plotted at their centroids, pin size and
     colour driven by that district's case count
   → switch the layer to Predicted, then open Patrol priorities

6. Refresh the page → open a saved chat from the sidebar
   → history and results restore from Neon
```

---

## Troubleshooting

**"Could not generate a valid query"** — Try rephrasing more specifically, e.g. include a district name or crime type.

**Related Cases panel is always empty** — `BriefFacts` is still the templated seed boilerplate. Run `npx tsx scripts/enrich-briefs.ts` (see [Related Cases](#related-cases-citations)) — the full-text index only has something to retrieve once narratives are real text.

**Mistral 401** — `MISTRAL_API_KEY` is missing or invalid.

**POST /api/chats returns 500** — Stale Prisma client in a long-running dev server. Run `npx prisma generate` and restart `npm run dev`.

**Deploy HTTP 413** — Upload exceeds Catalyst's 250 MB limit. Production builds exclude HuggingFace/ONNX; run `npm run build` and confirm `.next/standalone` is under 250 MB before `catalyst deploy`.

**Build fails with `EBUSY: resource busy, rmdir .next/standalone`** — a node process is still running from inside that folder. `catalyst serve` can leave its server alive even after the CLI prints its shutdown message; check `tasklist | grep node` and `taskkill //PID <pid> //F` before building or deploying. Same applies to a running `npm run dev`.

**Map doesn't render** — Leaflet is client-only, already wrapped in `dynamic(..., { ssr: false })`. Check browser console for tile errors.

**Prisma client not found after schema change**
```bash
npx prisma generate
```

**Re-seed from scratch**
```bash
npx tsx prisma/seed.ts
```
