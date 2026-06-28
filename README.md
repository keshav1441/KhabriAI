# Khabri AI
**Karnataka Police Crime Intelligence Assistant**
Datathon 2026 — KSP × Hack2skill Challenge 1

Conversational AI for investigators to query crime data in plain English. Type a question → get SQL-grounded answers, charts, hotspot maps, and repeat-suspect graphs. Powered by Catalyst QuickML (GLM-4-Flash). Crime DB mirrors the official KSP FIR entity-relationship schema.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| PostgreSQL | 14+ (local) |

No Ollama. No ngrok. No Groq. LLM runs on Catalyst QuickML.

---

## First-time setup

### 1. Install dependencies
```bash
cd khabri-ai
npm install
```

### 2. Configure environment
Edit `.env`:
```
DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/khabriAI?schema=public"
CATALYST_AUTH_TOKEN="your_zoho_oauth_token"
CATALYST_PROJECT_ID="46554000000013049"
CATALYST_GLM_MODEL="GLM-4-Flash"
```

**Getting CATALYST_AUTH_TOKEN:**
1. Open [Catalyst Console](https://catalyst.zoho.in) → your project
2. Go to **API** section → **Credentials**
3. Generate an OAuth access token (grant: `ZohoCatalyst.datastore.ALL`)
4. Paste the token value into `.env`

### 3. Create the database
```bash
# Windows PowerShell
psql -U postgres -c "CREATE DATABASE \"khabriAI\";"
```

### 4. Push schema to database
```bash
npx prisma db push
```
Creates all 26 tables from the official KSP FIR ER diagram.

### 5. Seed synthetic data
```bash
npx prisma db seed
```
Generates:
- 1 State (Karnataka) + 30 districts
- 210 police stations (real district names)
- 150 police employees
- 8 crime heads + 44 sub-heads (official KSP taxonomy)
- **5,000 FIR cases** (calibrated to NCRB Karnataka crime proportions)
- 5,000 victims + ~6,500 accused + 5,000 complainants
- ~1,500 arrests + ~1,250 chargesheets

Takes ~3–5 minutes.

### 6. Start dev server
```bash
npm run dev
```
Open **http://localhost:3000** → redirects to `/dashboard`.

---

## How it works

```
User question
    │
    ▼
Next.js API route (/api/chat)
    │
    ├─ Schema-in-prompt (26 tables + 10 few-shot Q→SQL examples)
    │
    ├─ POST → Catalyst QuickML (GLM-4-Flash) → generates SQL
    │
    ├─ Validate SQL (read-only check)
    │
    ├─ Execute against PostgreSQL
    │
    ├─ Classify result → table / chart / map / graph
    │
    └─ POST rows → GLM-4-Flash (streaming) → narrative summary
         │
         ▼
    Frontend: narrative + visualization + "View SQL" panel
```

### Database schema (official KSP FIR ER diagram)

| Table | Description |
|-------|-------------|
| `CaseMaster` | Core FIR record (crime no, date, location, status) |
| `District` / `Unit` | Geographic hierarchy (district → police station) |
| `CrimeHead` / `CrimeSubHead` | Crime taxonomy (8 heads, 44 sub-heads) |
| `Accused` | Accused persons linked to FIRs |
| `Victim` | Victims linked to FIRs |
| `ComplainantDetails` | Complainant details per FIR |
| `ArrestSurrender` | Arrest/surrender events |
| `ChargesheetDetails` | Chargesheet filing records |
| `Act` / `Section` | Legal acts + IPC/IT/NDPS/MV sections |
| `Employee` | Police officers (rank, designation, unit) |
| `CaseStatusMaster` | Under Investigation / Charge Sheeted / Closed |

### Auto-visualization

| SQL pattern | Visualization |
|-------------|--------------|
| `GROUP BY ... Accused ... COUNT` | Network graph (Cytoscape.js) |
| `latitude` / `longitude` in SELECT | Hotspot map (Leaflet) |
| `GROUP BY district/unit` | Choropleth map |
| `GROUP BY date/month/week` | Line chart (Recharts) |
| `GROUP BY ... COUNT` | Bar chart |
| Everything else | Data table |

### Proactive insights (auto on page load)
1. Districts with 40%+ crime spike vs last month
2. Repeat accused in last 30 days (3+ cases)
3. Crime category surging statewide this week

Clicking an insight pre-fills the chat with a follow-up question.

---

## Demo script (5 minutes)

```
1. "Show me Crimes Against Property in Bengaluru Urban in the last 6 months"
   → table with case numbers, police stations, crime sub-heads

2. "Break that down by month"
   → line chart (context retention across turns)

3. "Which accused have more than 2 cases in the last 30 days?"
   → bar chart → click "View SQL" for explainability story

4. "Show cybercrime hotspots across Karnataka with coordinates"
   → Leaflet map with incident pins

5. Click a proactive insight in the panel
   → demonstrates system intelligence — "it flagged this without being asked"
```

---

## Cloud Deploy — Catalyst

```bash
# 1. Install Catalyst CLI
npm install -g @zohocloud/catalyst-cli

# 2. Login + link project
catalyst login
catalyst init

# 3. Deploy functions
catalyst deploy

# 4. Set env vars in Catalyst console (Functions → Environment Variables):
#    CATALYST_AUTH_TOKEN, CATALYST_PROJECT_ID, DATABASE_URL

# 5. Build + deploy frontend to AppSail
npm run build
# Upload .next/ via Catalyst AppSail console
```

Functions live in `catalyst-functions/chat/index.js` and `catalyst-functions/insights/index.js`.

---

## Project structure

```
khabri-ai/
├── app/
│   ├── api/chat/route.ts         Streaming chat endpoint (SSE)
│   ├── api/insights/route.ts     Proactive anomaly detection
│   ├── dashboard/page.tsx        Main investigator UI
│   └── generated/prisma/         Prisma v7 generated client
├── components/
│   ├── chat/                     ChatWindow, MessageBubble, StreamingText
│   ├── viz/                      ResultsTable, CrimeChart, CrimeMap, NetworkGraph
│   └── insights/                 InsightPanel
├── lib/
│   ├── db.ts                     Prisma client (pg adapter)
│   ├── llm.ts                    Catalyst QuickML client (GLM-4-Flash)
│   ├── prompt-builder.ts         KSP schema + few-shot SQL examples
│   ├── sql-validator.ts          Read-only SQL safety enforcer
│   └── query-classifier.ts       Auto-detects viz type from SQL
├── store/chat.ts                 Zustand conversation state
├── prisma/
│   ├── schema.prisma             26-table KSP FIR schema (official ERD)
│   └── seed.ts                   5,000 synthetic KSP-calibrated FIR records
└── catalyst-functions/
    ├── chat/index.js             Catalyst Function: orchestration
    └── insights/index.js         Catalyst Function: anomaly queries
```

---

## Troubleshooting

**"Could not generate a valid query"**
GLM returned non-SQL text. Try rephrasing more specifically, e.g. include district name or crime type.

**QuickML 401 Unauthorized**
`CATALYST_AUTH_TOKEN` expired. Regenerate from Catalyst Console → API Credentials.

**Map doesn't render**
Leaflet is client-side only — already wrapped in `dynamic(() => import(...), { ssr: false })`. Check browser console for tile errors.

**Prisma client not found after schema change**
```bash
npx prisma generate
```

**Re-seed from scratch**
```bash
npx prisma db seed
```
Truncates all tables then reinserts 5,000 cases (~3–5 min).
