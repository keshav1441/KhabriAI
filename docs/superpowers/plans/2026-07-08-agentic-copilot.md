# Agentic Investigation Copilot Implementation Plan

> Execution: inline, sequential, single track, no git commits, no worktrees/branches — everything applied directly to the working tree per user instruction.

**Goal:** Replace single-shot text-to-SQL chat with a multi-tool agentic orchestrator, integrate Catalyst Cache/Cron/QuickML/Data Store, add a live CaseBoard reasoning-trace UI, and clean up dead code.

**Architecture:** Groq tool-calling agentic loop (max 4 iterations) in `app/api/chat/route.ts`, tools wrap existing SQL/related-cases/insights/network-map logic plus a new QuickML-backed risk predictor; Catalyst SDK backs cache/cron/audit log.

**Tech Stack:** Next.js 16 App Router, groq-sdk (llama-3.3-70b-versatile for orchestration), Prisma/Neon Postgres, zcatalyst-sdk-node (new dep).

## Global Constraints
- No git commits during implementation (user instruction)
- No parallel branches/worktrees — single sequential track
- Core chat must keep working even if Catalyst services are unreachable (best-effort/non-blocking)
- Preserve existing "classified case-file" visual design system

---

### Phase 1 — Cleanup
**Files:** delete `catalyst-functions/`, `app/api/debug-llm/route.ts`, `components/viz/CrimeMap.tsx`; consolidate theme tokens (`app/globals.css` vs `components/ThemeProvider.tsx` — pick `ThemeProvider.tsx`'s runtime values as source of truth, `globals.css` reads from CSS vars only, no duplicate hex).
**Verify:** `npm run build` succeeds, dashboard loads, theme toggle still works both modes.

### Phase 2 — Catalyst Cache
**Files:** add `zcatalyst-sdk-node` dep; new `lib/catalyst-client.ts` (init helper); modify `lib/embeddings-groq.ts` cache read/write to use Catalyst Cache instead of `lib/rag-embeddings-cache.json`; new `lib/insights-cache.ts`.
**Interfaces:** `getCatalystApp(req?): CatalystApp`; cache helpers `cacheGet(key): Promise<string|null>`, `cacheSet(key, value, ttlSeconds)`.
**Verify:** RAG example lookup still returns results (embeddings or LLM-fallback path), no crash when Catalyst unreachable locally (falls back gracefully).

### Phase 3 — Catalyst Cron (Insights precompute)
**Files:** new `catalyst-functions-v2/insights-cron/` (or Node cron script invoked via Catalyst Job Scheduling) that runs the 3 queries currently in `app/api/insights/route.ts` and writes results to Catalyst Cache via `lib/insights-cache.ts`; modify `app/api/insights/route.ts` to read from cache first, live-compute+populate on miss.
**Verify:** insights route returns data immediately from cache after one cron/manual run; falls back to live compute on cold cache.

### Phase 4 — Agent orchestrator core
**Files:** new `lib/agent/tools.ts` (tool schema defs + implementations wrapping `generateSQL`/`case-retrieval`/`insights-cache`/`network-data`/`map-data`), new `lib/agent/orchestrator.ts` (the bounded tool-calling loop), rewrite `app/api/chat/route.ts` to use orchestrator, emit new SSE `step` event type.
**Interfaces:** `runAgent(question, history): AsyncGenerator<StepEvent | TokenEvent | DoneEvent>`; `StepEvent = {type:"step", tool, args, result, status}`.
**Verify:** ask a multi-part question in dev, confirm multiple tools fire and final narrative synthesizes; single-tool questions still work (regression check against old behavior).

### Phase 5 — QuickML predictRisk tool
**Steps:** one-time Catalyst console pipeline setup (binary classifier: charge-sheeted vs not, trained on crime type/district/victim+accused counts/days-since-registered from seed data) — user walks through console; then add `predictRisk` tool implementation in `lib/agent/tools.ts` calling the QuickML prediction endpoint via `zcatalyst-sdk-node`'s Zia/QuickML client.
**Verify:** agent calls `predictRisk` on a case-outcome question, returns a probability, surfaces in narrative.

### Phase 6 — Catalyst Data Store audit log
**Files:** new `lib/agent/audit-log.ts` (fire-and-forget write per step + per completed run) using Catalyst Data Store table `AgentAuditLog`; wire into orchestrator.
**Verify:** audit rows appear in Catalyst Data Store console after a chat run; failures don't block/slow the chat response.

### Phase 7 — CaseBoard UI
**Files:** new `components/chat/CaseBoard.tsx`, modify `ChatWindow.tsx` to consume `step` SSE events and render pinned steps live, modify `dashboard/page.tsx` chat view layout to add the side panel.
**Verify:** visually confirm steps pin in live during a real multi-tool question, matches design system (mono font, pin icon, amber/green/red states).

### Phase 8 — Trust/safety hardening
**Files:** `lib/sql-validator.ts` (swap regex blocklist for AST-based validation via a SQL parser package), new session auth (signed cookie/JWT) replacing spoofable `X-User-Email` in `lib/chat-auth.ts`/`lib/chat-api.ts`, update all API routes consuming it.
**Verify:** mutating SQL attempts still rejected under new validator; auth can no longer be spoofed by setting a header — requires valid session token.

### Phase 9 — Final polish
**Files:** rewrite `components/views/AboutView.tsx` to reflect actual stack/models/features (including agent + Catalyst integrations); add loading skeletons where "Loading…" text currently used.
**Verify:** About page copy matches real implementation; no more stale "Next.js 15" / wrong model name claims.

## Self-review notes
- Spec coverage: all spec sections (architecture, tools, 4 Catalyst integrations, data flow, error handling, UI, testing, sequencing) map 1:1 to phases 1-9 above.
- No placeholders left unresolved except QuickML's exact console click-path, which is inherently a live walkthrough with the user, not scriptable — flagged explicitly in Phase 5, not hidden.
