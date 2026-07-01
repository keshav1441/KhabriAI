# KhabriAI

**Karnataka Police Crime Intelligence Assistant**
Datathon 2026 — KSP × Hack2Skill Challenge 1

Conversational AI for investigators to query crime data in plain English. Sign in, ask a question → RAG retrieves similar examples → LLM generates SQL → results stream back with a plain-English analyst summary, chart, map, or network graph. Chat history is saved per user in Neon.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, standalone output) |
| Database | Neon PostgreSQL + Prisma |
| Auth | PBKDF2-SHA512 (100k iterations) · `KhabriUser` table |
| LLM | Groq — `qwen/qwen3-32b` (SQL) · `llama-3.1-8b-instant` (summary) |
| Embeddings | Groq API (`nomic-embed-text-v1.5`) · LLM fallback for example selection |
| Maps | Leaflet + react-leaflet |
| Network graph | Cytoscape.js + cose-bilkent |
| Charts | Recharts |
| State | Zustand |
| Styling | Tailwind v4 + CSS custom properties |
| Deployment | Zoho AppSail |

---

## How it works

```
User question
     │
     ▼
RAG retrieval — Groq embeddings (`nomic-embed-text-v1.5`) when available, else Groq 8B example selection → top examples returned
     │
     ▼
Groq qwen/qwen3-32b — schema + few-shot examples → SQL
     │
     ▼
Validate (SELECT-only, no mutations) → execute on Neon → classify viz type
     │
     ▼
Stream: metadata (rows, vizType) + analyst summary tokens (SSE)
     │
     ▼
Persist exchange to ChatSession / ChatMessage (per logged-in user)
```

Retrieval runs entirely on **Groq** (no local ONNX/HuggingFace). On startup the app probes the Groq embeddings API; if available it uses `nomic-embed-text-v1.5` with cached example vectors in `lib/rag-embeddings-cache.json`. If embeddings are not enabled on your Groq account, it falls back to `llama-3.1-8b-instant` picking the best matching examples.

Force a mode with `RAG_MODE=embed` or `RAG_MODE=llm` in `.env`.

SQL is generated and stored server-side but **not shown in the chat UI** — investigators see the narrative summary, table/chart/map, and CSV export only.

### Auto-visualization

| SQL pattern | Visualization |
|-------------|--------------|
| `GROUP BY … Accused … COUNT` | Network graph (Cytoscape.js) |
| `GROUP BY district/unit` | Bar chart |
| `GROUP BY date/month/week` | Line chart (Recharts) |
| `latitude` / `longitude` in SELECT | Hotspot map (Leaflet) |
| Everything else | Data table |

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
GROQ_API_KEY=your_groq_key
```

### 3. Push schema + seed data
```bash
npx prisma db push
npx prisma db seed
```

Seed generates: 1 state · 30 districts · 210 police stations · 5,000 FIR cases (calibrated to NCRB Karnataka proportions) · victims, accused, arrests, chargesheets. Takes ~3–5 minutes.

### 4. Start dev server
```bash
npm run dev
```
Open **http://localhost:3000** → sign up or log in → dashboard.

---

## Auth & chat history

- **Sign up / log in** at `/signup` and `/login`. Credentials are hashed with PBKDF2-SHA512 and stored in `KhabriUser`.
- **Session** is client-side (`sessionStorage`) — the dashboard redirects to `/login` if not authenticated.
- **Chat history** is stored in Neon (`ChatSession`, `ChatMessage`) and listed in the sidebar under **Recent chats**.
- **New chat** starts a fresh thread; the first message auto-titles the session.
- Chat API routes use the `X-User-Email` header (from `sessionStorage`) to scope data to the logged-in user.

---

## Accuracy eval

Runs all 25 RAG examples through the full pipeline (embed → retrieve → generate SQL → execute) and reports execution accuracy:

```bash
npx tsx eval/run.ts --holdout          # Groq RAG (default)
npx tsx eval/run.ts --holdout --keywords  # keyword Jaccard baseline
```

Use `--holdout` to exclude each question's own example from retrieval (honest generalization test). Without the flag, the exact Q→SQL pair can be retrieved and scores are inflated.

Output: `.` pass · `F` validation fail · `E` execution error · summary with retrieval similarity and SQL token overlap.

---

## Project structure

```
app/
  (auth)/login/     Login page
  (auth)/signup/    Sign up page
  dashboard/        Main app shell (sidebar, chat, map, reports, about)
  api/
    auth/login/       Credential check
    auth/signup/      User registration
    chats/            List / create chat sessions
    chats/[id]/       Load, append messages, delete session
    chat/             SSE — RAG + SQL generation + streaming summary
    map-data/         Crime locations with lat/lng
    network-data/     Accused co-occurrence graph
    reports/          Pre-aggregated insight cards
components/
  chat/             ChatWindow, MessageBubble, ChatHistory sidebar
  views/            Map, Reports, About panels
  viz/              CrimeMap, NetworkGraph, ResultsTable, CrimeChart
lib/
  rag.ts                Groq RAG router (embeddings → LLM fallback)
  embeddings-groq.ts    Groq embedding API + on-disk cache
  rag-llm.ts            Groq 8B example selection fallback
  rag-keywords.ts       Keyword Jaccard (eval baseline only)
  rag-examples.json 25 Q→SQL pairs (the RAG knowledge base)
  llm.ts            generateSQL() + streamSummary() via Groq
  prompt-builder.ts KSP database schema (injected into every prompt)
  sql-validator.ts  SELECT-only guard, multi-statement block
  query-classifier.ts  SQL → vizType (table / chart / graph)
  chat-auth.ts      Resolve user from X-User-Email header
  chat-api.ts       Client helpers for chat API calls
  db.ts             Prisma client (pg adapter)
store/
  chat.ts           Zustand — messages, active session, session list
prisma/
  schema.prisma     KSP FIR schema + KhabriUser + ChatSession + ChatMessage
  seed.ts           5,000 synthetic KSP-calibrated FIR records
eval/
  run.ts            Offline accuracy harness
scripts/
  prepare-standalone.mjs  Copies static/public into the AppSail bundle
```

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `GROQ_API_KEY` | Yes | Groq API key |
| `GROQ_SQL_MODEL` | No | SQL model (default `qwen/qwen3-32b`) |
| `GROQ_EMBED_MODEL` | No | Embedding model (default `nomic-embed-text-v1.5`) |
| `GROQ_RAG_MODEL` | No | LLM example-picker fallback (default `llama-3.1-8b-instant`) |
| `RAG_MODE` | No | `embed` or `llm` to force retrieval mode |
| `GROQ_SUMMARY_MODEL` | No | Summary model (default `llama-3.1-8b-instant`) |

---

## Cloud deploy — Catalyst AppSail

```bash
catalyst deploy
```

The `predeploy` hook runs `next build`, prepares the standalone bundle, and uploads it. The standalone output in `.next/standalone` is what AppSail serves (~170 MB). Catalyst rejects uploads over **250 MB** (HTTP 413).

**AppSail env vars to set:**
- `DATABASE_URL`, `GROQ_API_KEY`

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

5. "Show cybercrime hotspots across Karnataka with coordinates"
   → Leaflet map with incident pins

6. Refresh the page → open a saved chat from the sidebar
   → history and results restore from Neon
```

---

## Troubleshooting

**"Could not generate a valid query"** — Try rephrasing more specifically, e.g. include a district name or crime type.

**Groq 401** — `GROQ_API_KEY` is missing or invalid.

**POST /api/chats returns 500** — Stale Prisma client in a long-running dev server. Run `npx prisma generate` and restart `npm run dev`.

**Deploy HTTP 413** — Upload exceeds Catalyst's 250 MB limit. Production builds exclude HuggingFace/ONNX; run `npm run build` and confirm `.next/standalone` is under 250 MB before `catalyst deploy`.

**Before deploying:** stop any running `npm run dev` — a locked `.next` causes `EBUSY` errors during build. After schema changes, `lib/db.ts` recreates the client when new models are missing.

**Map doesn't render** — Leaflet is client-only, already wrapped in `dynamic(..., { ssr: false })`. Check browser console for tile errors.

**Prisma client not found after schema change**
```bash
npx prisma generate
```

**Re-seed from scratch**
```bash
npx tsx prisma/seed.ts
```
