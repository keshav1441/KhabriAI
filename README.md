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
| Embeddings | Gemini API (`gemini-embedding-2`) · LLM fallback for example selection |
| Case retrieval | Postgres full-text search (`tsvector`/`ts_rank`) over `CaseMaster.BriefFacts` |
| Maps | Leaflet + react-leaflet |
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

Few-shot **example** retrieval (picking which Q→SQL pairs to show the SQL generator) runs on hosted APIs only (no local ONNX/HuggingFace). On startup the app probes the Gemini embeddings API; if available it uses `gemini-embedding-2` with cached example vectors in `lib/rag-embeddings-cache.json`. If embeddings are unavailable, it falls back to `mistral-small-latest` picking the best matching examples.

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

Hotspot maps (Leaflet) live in the dedicated **Map** view, not in chat.

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
- **Upgrade path**: if you add a real embedding-capable API key later (Gemini, OpenAI), only `lib/case-retrieval.ts` needs to change — swap the SQL for a pgvector `<=>` search. The chat route, SSE payload, frontend panel, and chat-history persistence are already provider-agnostic.

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

### Google sign-in (optional)

- Set `GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to the same OAuth 2.0 **Web application** client ID (Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID). Leave both empty and the button is not rendered.
- **Authorized JavaScript origins** must include `http://localhost:3000` and your Catalyst AppSail URL (e.g. `https://<app>.catalystserverless.in`). No redirect URI is needed — the GIS button posts the ID token to `POST /api/auth/google`.
- The token is verified via Google's `tokeninfo` endpoint (no extra dependency), then the `KhabriUser` is found or created by email and the same `khabri_session` cookie is issued. Google-only accounts have a null `passwordHash` and cannot use the password form.

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

### Modus-operandi linking

```bash
npm run enrich            # LLM-expand templated BriefFacts into narratives (MO series for repeat offenders)
npm run embed             # embed narratives into CaseMaster.BriefFactsEmbedding (pgvector, mistral-embed 1024-d)
npm run eval:similarity   # type@5 / group@5 / series recall@5 / cross-district share
```

`lib/case-retrieval.ts` exposes `similarCasesTo(caseId)` and `similarCasesToText(description)`; the agent tool `findSimilarCases` and `GET /api/case/similar?id=` (Case Drawer panel) sit on top. Mistral free/low tiers rate-limit at ~3 concurrent chat calls: set `ENRICH_CONCURRENCY=3` if `npm run enrich` logs 429s, and re-run it — failed batches stay templated and are retried.

### Entity resolution & clarification

`lib/entity-resolve.ts` checks district / station / crime-type literals in generated SQL against the real vocabulary (in-memory trigram similarity + an alias table for legacy names such as Bangalore, Mysore, Belgaum, Gulbarga, Tumkur) and rewrites near-misses; the Case Board shows the correction. Person names are never rewritten: a zero-row person query returns `suggestions` (closest real names), and a bare first name matching many people returns `ambiguousPerson` with no rows. The orchestrator has an `askClarification` tool that ends the turn with a question instead of a query. The previous turn's SQL is appended to assistant history (`[SQL used: …]`) so follow-ups refine it.

---

## Project structure

```
app/
  (auth)/login/     Login page
  (auth)/signup/    Sign up page
  dashboard/        Main app shell (sidebar, chat, map, reports, about)
  api/
    auth/login/       Credential check → sets session cookie
    auth/google/      Google ID-token check → find-or-create user, sets session cookie
    auth/logout/      Clears session cookie
    auth/signup/      User registration
    chats/            List / create chat sessions
    chats/[id]/       Load, append messages, delete session
    chat/             SSE — agent loop: tool steps + metadata + streaming narrative
    insights/         Anomaly insight cards (Catalyst Cache-backed)
    cron/insights/    Precompute target for scheduled insight refresh
    map-data/         Crime locations with lat/lng
    network-data/     Accused co-occurrence graph
    reports/          Pre-aggregated insight cards
components/
  chat/             ChatWindow, MessageBubble, CaseBoard (live tool steps), RelatedCases, ChatHistory
  views/            Map, Network, Reports, About panels
  viz/              NetworkGraph, ResultsTable, CrimeChart, CaseDrawer
lib/
  agent/
    orchestrator.ts   Agent loop — Mistral planner, tool execution, SSE event stream
    tools.ts          5 tool implementations + JSON schemas
    audit-log.ts      Fire-and-forget audit trail to Catalyst Data Store
  rag.ts                RAG router (embeddings → LLM fallback) — few-shot SQL examples only
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
  schema.prisma     KSP FIR schema + KhabriUser + ChatSession + ChatMessage
  seed.ts           20,000 synthetic KSP-calibrated FIR records
  migrations/       …_add_case_fts — GIN full-text index on BriefFacts + ChatMessage.relatedCases
eval/
  run.ts            Offline accuracy harness
scripts/
  prepare-standalone.mjs  Copies static/public/rag-examples.json + .env into the AppSail bundle, dereferences symlinks
  enrich-briefs.ts        LLM-expands templated BriefFacts into real FIR narratives
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
| `GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | No | OAuth Web client ID (same value) — enables "Sign in with Google" |
| `CATALYST_AUTOML_MODEL_ID` | No | QuickML model ID for the `predictRisk` tool (AppSail only) |
| `CRON_SECRET` | No | Bearer token guarding `/api/cron/insights` precompute |

---

## Cloud deploy — Catalyst AppSail

```bash
catalyst deploy
```

The `predeploy` hook runs `next build`, prepares the standalone bundle, and uploads it. The standalone output in `.next/standalone` is what AppSail serves (~170 MB). Catalyst rejects uploads over **250 MB** (HTTP 413).

**AppSail env vars to set:**
- `DATABASE_URL`, `MISTRAL_API_KEY`, `SESSION_SECRET`
- Optional: `CATALYST_AUTOML_MODEL_ID` (QuickML risk tool), `CRON_SECRET` (insights precompute)

**Optional Catalyst console setup** (features degrade gracefully without them):
- Data Store table `AgentAuditLog` — agent audit trail (columns per `lib/agent/audit-log.ts`)
- QuickML classifier — enables the `predictRisk` tool
- Job Scheduling — hit `/api/cron/insights` (Bearer `CRON_SECRET`) every ~3h to keep insight cards warm

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
   → Leaflet hotspot map of incidents across Karnataka

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
