# KhabriAI — 3-minute demo script

Every step below was verified against the seeded database. Run `npm run demo:check` before
presenting: it re-asserts the anchors (the cases, the ambiguous name, the MO series) still exist.

**Setup (before the room fills):** signed in, Intelligence Chat open, Case Board visible, language EN.
Warm the model once with any question so the first live answer is fast. Keep the Kannada toggle for step 5.

---

### 0:00 — The question an SHO actually asks
> **Which districts have rising crime this month compared to last month?**

What they see: Case Board pins *Query Database*, the SQL is generated, validated and executed; a
bar chart and a two-sentence analyst narrative with numbers. No SQL shown unless you expand it.
Say: *"No analyst, no dashboard. The interface is a question."*

### 0:30 — It doesn't guess about people
> **Show me everything on Ravi**

What they see: Case Board — *"25 different people match 'Ravi'"*, then a *Clarify* step; the
assistant lists five real names and asks which one. **Reply:** `Ravi Gowda` → 59 cases, table.
Say: *"A police tool must never silently decide who you meant. It asks."*

### 1:00 — Legacy names, typos, follow-ups
> **How many theft cases were registered in Mysore?** → then reply **now only for 2025**

What they see: first answer statewide count for Mysuru (it maps Mysore → Mysuru; a correction
like *"Belgavi → Belagavi"* shows on the Case Board when a spelling is fixed); the follow-up refines
the previous SQL rather than re-reading the prose (the answer drops from the all-time count to the
2025 count — 26 at time of writing).

### 1:30 — The moment: modus-operandi linking across districts
> **Find cases in other districts with the same modus operandi as case 13778**

What they see: Case Board *Modus Operandi Link — 10 linked cases*; a table of matches from other
districts with similarity scores; narrative: *"…during a family wedding, offenders climb the compound
wall to a balcony, take only gold, and leave in a white Bolero — matches in Vijayapura, Kolar,
Chikkamagaluru, Chamarajanagara…"*. Click any CaseMasterID → the Case File drawer → **Similar Modus
Operandi** panel, other-district links in red → click one to walk the chain.
Say: *"Five open cases, five districts, five investigating officers who have never spoken to each
other. The narratives never name the accused — this is matched on method. A station can't see this;
the state can."*

Anchor facts (`npm run demo:check` asserts these):
- Series: repeat offender **KSP-P-00928**, Crimes Against Property, 7 cases in 5 districts, 5 open.
- Source case **#13778** (Davangere, Dacoity, Under Investigation). Alternates: #539 (Chamarajanagara), #4662 (Vijayapura).

### 2:20 — Explain and export
Open **Profiling** for `KSP-P-00928` (case history, associates, timeline) or ask
> **Predict the chargesheet likelihood for a theft case in Mysuru with 1 accused, 2 victims, 40 days old, no arrest**

What they see: a probability with signed per-feature contributions, not a bare score.
Then **↓ PDF** on the conversation: the whole investigation, citations included, as a document.

### 2:45 — Kannada
Toggle **ಕನ್ನಡ**, ask
> **ಬೆಂಗಳೂರು ನಗರದಲ್ಲಿ ಎಷ್ಟು ಪ್ರಕರಣಗಳು ಇನ್ನೂ ತನಿಖೆಯಲ್ಲಿವೆ?**

What they see: the same pipeline, the narrative in Kannada, numbers in digits. Tap *Listen* for TTS.
Close: *"In the language the officer thinks in, at 2 am, with a cited, auditable answer."*

---

## If something goes wrong
- **Mistral rate limit (429) / slow first token:** wait 10 s and re-send; never run the enrichment or
  eval scripts during a demo — they share the API key's rate limit.
- **Clarification doesn't trigger on "Ravi":** the guard is deterministic (bare first name matching
  > 3 people returns no rows); if the planner still answers, ask *"Show me everything on Priya"*.
- **No MO links:** embeddings missing → `npm run embed` (5 min). `GET /api/case/similar?id=13778`
  must return 5 cases.
- **"last 30 days" returns nothing:** the corpus has drifted behind the calendar → `npm run shift-dates -- --apply`.

## Numbers you can quote (see PROTOTYPE_BRIEF.md → Evaluation)
- Text-to-SQL: 81–84 % execution match on 99 holdout questions, 97–99 % execute, Kannada 10/10.
- MO linking: neighbours share the crime group 94 %; same-crew case among 5 neighbours 22 % at
  38 % corpus coverage (re-measure after full embedding); 100 % of crew links cross a district.
- Every query: SELECT-only AST validation, `LIMIT 500`, 8 s statement timeout; every tool call audited.
