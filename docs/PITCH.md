# KhabriAI — video pitch script

**Target: 4 min 30 s.** Cut the beats marked `[CUT FOR 3:00]` to land at ~3 minutes.
Datathon 2026 · KSP × Hack2Skill · Challenge 1

Every number in this script is asserted by `npm run demo:check` or measured in
`PROTOTYPE_BRIEF.md → Evaluation`. Don't improvise new ones on camera.

**Before you record:** signed in as an HQ account, language EN, model warmed with one
throwaway question, alerts seeded (`npm run alerts`), embeddings present
(`GET /api/case/similar?id=13778` returns 5 cases). Record at 1440p, browser zoom 100 %.

---

## 0:00 — Cold open

> **On screen:** Black. Then the Command Centre, loading live.

**Say:**
> It's 2 a.m. in a station in Davangere. An SHO has a dacoity on his desk — two men on
> a black Pulsar, no number plate, CCTV cable cut first. He wants to know one thing:
> *has this crew done this before?*
>
> Karnataka Police has twenty thousand FIRs that can answer him. He has no way to ask them.
>
> That's the gap. Not data. **Access.**

---

## 0:20 — One question, plain English

> **On screen:** Intelligence Chat. Type: *Which districts have rising crime this month compared to last month?*
> Let the Case Board pin its steps. Don't narrate them — let it run.

**Say:**
> This is KhabriAI. An officer asks in plain English. An agent plans which tools to call,
> runs them in parallel, and streams every step as it happens — so nothing is a black box.
> Chart, and a two-sentence analyst narrative with the real numbers in it.
>
> That's the front door. Now let me show you the building — because the chat is the
> smallest part of this.

*(Keep this beat under 30 seconds. Resist the urge to expand it.)*

---

## 0:50 — Crime Map: **where**

> **On screen:** Crime Map. Toggle **Observed → Incidents** (markers spread onto real streets)
> **→ Predicted**. Then open **Patrol Priorities**.

**Say:**
> Most crime dashboards drop one dot on a district capital and call it a map. That's a
> bar chart in disguise.
>
> Our incident layer reads the actual coordinates on each FIR — so you see burglaries
> clustering on *one arterial road*, not on Tumakuru city. And cases with no location
> aren't hidden; they're counted, because a blank field is itself a finding about the register.
>
> The predicted layer runs a least-squares trend per district and crime group over six
> complete months, and turns it into a patrol priority list. Not where crime *was*.
> Where it's **going**.

---

## 1:25 — When Crime Happens: **when**

> **On screen:** When Crime Happens. Hover the day × hour heatmap. Filter to one crime group.

**Say:**
> The map answers *where*. This answers *when* — hour of day, day of week, per district,
> per crime type.
>
> Where plus when isn't a statistic. It's a **shift plan**.

`[CUT FOR 3:00]`

---

## 1:45 — The moment: modus operandi across district lines

> **On screen:** Chat: *Find cases in other districts with the same modus operandi as case 13778.*
> Wait for the table. Then click a CaseMasterID → Case File drawer → **Similar Modus Operandi**.

**Say:**
> Back to our 2 a.m. dacoity. Case 13778.
>
> Every FIR narrative is embedded as a vector. This is a nearest-neighbour search over
> *method* — and the narratives never name the accused, so it can't cheat by matching names.
>
> Uttara Kannada. Gadag. Bengaluru Urban. Udupi. All above ninety-two percent.
>
> Five open cases. Five districts. **Five investigating officers who have never spoken
> to each other.** A station cannot see this. The state can.

---

## 2:20 — Crew Dossier: from a link to a briefing

> **On screen:** Crew Dossier for that case. Scroll members → timeline → districts crossed → **Print PDF**.

**Say:**
> A match tells you *what else looks like this*. It doesn't tell you what to do Monday morning.
>
> So we walk outward two hops — along co-accused links and along shared method — and hand
> back a briefing: who's in the crew, every case on one timeline, which districts it's
> crossed, and what stage each file is at.
>
> One button. That's a printable dossier for a joint operation.

---

## 2:50 — Case Pipeline: where cases die

> **On screen:** Case Pipeline. Funnel FIR → arrest → chargesheet → court. Point at the named
> slowest step, then the drop-off column.

**Say:**
> Every police system counts cases registered. Almost none of them count cases *lost*.
>
> This is the funnel from FIR to court. It names the slowest step, gives the median days
> at each stage — and this column is the one nobody wants to look at: the share of cases
> that **never reach that step at all**.
>
> Break it down by district or by crime group and you're no longer arguing about
> performance. You're pointing at it.

---

## 3:15 — My Desk: the clock that actually matters

> **On screen:** My Desk. Pendency list sorted by days remaining, red items at top.

**Say:**
> For an investigating officer, one deadline outranks everything: the statutory chargesheet
> clock. Sixty days, or ninety.
>
> My Desk runs that clock across every open case and ranks by days remaining — what's open,
> what's overdue, and what's closest to slipping. Not a report he requests. The first thing
> he sees.

`[CUT FOR 3:00]`

---

## 3:35 — Alerts: the system speaks first

> **On screen:** Header bell → alert feed. Open an `mo_link` alert, then a `duplicate` alert.

**Say:**
> Everything so far is *pull* — it exists while someone is looking. These detectors run on a
> schedule and push.
>
> Spikes. Repeat suspects. Weekly surges. Forecasts. Duplicate FIRs. And cross-district
> method links — where one finding is routed to **both** districts, so the two stations that
> can't see each other's files both get told.
>
> Scoped to what that officer is allowed to see. De-duplicated, so re-running the job
> doesn't re-notify anyone — only moving numbers do.

---

## 3:55 — Register FIR: it writes, too

> **On screen:** Register FIR. Upload a document → fields populate → section suggestions →
> duplicate warning fires.

**Say:**
> And it isn't read-only. Upload a complaint document and the fields extract themselves —
> quoted from the text, never invented, every value resolved against the real lookup tables.
>
> Act sections get suggested. Likely duplicates get flagged *before* filing — the same
> incident entered twice is a real, expensive problem.
>
> Register it, and the assistant can answer questions about it immediately.

---

## 4:10 — Why a police force can trust it

> **On screen:** Split quickly — groundedness badge in chat → `/admin/audit` → sign in as
> `sho.mysuru@ksp.test`, header reads **SCOPE · MYSURU**, ask for a case in another district → not found.

**Say:**
> Four things, quickly.
>
> The database role is read-only, and generated SQL is parsed into a syntax tree and
> rejected unless it's a single SELECT — not a blocklist someone can word their way around.
>
> Every figure in an answer is re-derived from the tool results that produced it. If it
> can't be, it doesn't ship.
>
> Every tool call is audited — the officer, and the scope it ran under.
>
> And that scope is enforced by the **database**, not a prompt. Same assistant, same
> question, different officer — Mysuru sees Mysuru. Row-level security.

---

## 4:35 — Close

> **On screen:** Toggle **ಕನ್ನಡ**. Whole interface flips. Ask a question in Kannada. Let the
> answer stream. Hold on it.

**Say:**
> One more thing.
>
> Every screen, every finding, every narrative — in Kannada. Not a translated label. The
> whole product.
>
> Because the officer at 2 a.m. isn't thinking in English.
>
> **KhabriAI. In the language the officer thinks in, with an answer he can cite — and audit.**

---

## Numbers you may quote on camera

| Claim | Figure |
|---|---|
| Text-to-SQL accuracy | 81–84 % execution match on 99 holdout questions; 97–100 % execute |
| Kannada question handling | 9–10 / 10 |
| MO neighbours share the crime group | 96 % |
| MO neighbours share the specific crime type | 67 % |
| Same-crew case in the top 5, from narrative alone | 18 % |
| Of those crew links, cross a district boundary | 87 % |
| Case 13778 top matches | Uttara Kannada #3008, Gadag #9667, Bengaluru Urban #9363, Udupi #10865 — all ≥ 92 % |
| Every query | SELECT-only AST validation · `LIMIT 500` · 8 s statement timeout · audited |

## Stack, if a judge asks

Next.js 16 · Neon PostgreSQL + Prisma · Mistral `mistral-large-latest` orchestrator over
**9 tools** with `mistral-small-latest` narrating · `mistral-embed` 1024-d vectors in pgvector ·
Zoho Catalyst for cache, audit data store and the QuickML chargesheet-risk model ·
Leaflet · Cytoscape · Recharts · deployed on Zoho AppSail.

## Delivery notes

- **Don't read the Case Board aloud.** Let it stream while you talk over it. It sells itself.
- **Pause after "five investigating officers who have never spoken to each other."** That is
  the line the room remembers. Give it a full beat.
- Say **"twenty thousand FIRs"**, not "20,000 rows". You're describing police work, not a table.
- If a live call is slow, keep talking — never narrate the spinner.
- If Mistral 429s, wait ten seconds and re-send. Never run `enrich`, `embed` or the eval
  scripts while recording; they share the API key's rate limit.
