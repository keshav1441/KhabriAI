# KhabriAI — Agentic Investigation Copilot (Design)

Date: 2026-07-08
Status: Approved for planning

## Context

KhabriAI is a Karnataka State Police FIR intelligence assistant (Datathon 2026, KSP × Hack2Skill Challenge 1) built on Next.js 16 + Prisma/Neon Postgres + Groq. Current pipeline is a single-shot text-to-SQL chat: one question → one generated SQL query → one narrative summary. Several built features (`InsightPanel`, `NetworkView`) are orphaned (not wired into any page), the visual design system is strong but underused, and the hackathon is Zoho-Catalyst-sponsored while the app currently only uses Catalyst for AppSail hosting.

Goal: turn this into a hackathon-winning submission by (1) replacing the single-shot pipeline with a real multi-tool agentic orchestrator, (2) weaving in genuine Zoho Catalyst services beyond hosting, (3) revamping the UI around a live "reasoning trace" panel, and (4) hardening trust/safety and cleaning up dead code.

Constraints: solo build (user + Claude), single sequential track — no parallel branches/worktrees, no git commits during the work, everything done directly on the local working tree.

## Architecture

Replace `app/api/chat/route.ts`'s linear pipeline with an agent orchestrator loop:

```
POST /api/chat
  → orchestrator loop (max 4 iterations), Groq llama-3.3-70b-versatile as planner
      tools: queryDatabase, searchRelatedCases, checkInsights,
             getNetworkOrMapData, predictRisk
      each tool call + result streamed to client as a "step" SSE event
      each step also appended to Catalyst Data Store audit log (async, non-blocking)
  → final narrative synthesis, streamed as today (tool_choice: "none")
```

### Tools

| Tool | Wraps | Notes |
|---|---|---|
| `queryDatabase` | `generateSQL()` + `validateSQL()` + `$queryRawUnsafe` | Existing few-shot RAG (`lib/rag.ts`) untouched |
| `searchRelatedCases` | `lib/case-retrieval.ts` | Existing FTS + overlap-gate retrieval untouched |
| `checkInsights` | 3 queries currently in `app/api/insights/route.ts` | Reads from Catalyst Cache, populated by Catalyst Cron; live-compute + cache-populate fallback on cold cache |
| `getNetworkOrMapData` | `/api/network-data`, `/api/map-data` | Model picks based on question |
| `predictRisk` (new) | Catalyst QuickML AutoML pipeline | Trained via one-time Catalyst console setup; binary classifier predicting whether a case will be charge-sheeted (`CaseStatusMaster` outcome), trained on case features (crime type, district, victim/accused counts, days-since-registered) from the seeded dataset |

### Catalyst integrations

1. **Cache** — replaces `lib/rag-embeddings-cache.json` (gitignored flat file) as the few-shot embedding cache backend; also backs the Insights cache.
2. **Cron / Job Scheduling** — precomputes the 3 Insights aggregations on a schedule instead of live per chat request.
3. **QuickML (AutoML)** — real ML pipeline trained on the 20k seeded FIR rows, wired as the `predictRisk` tool. Requires one manual pipeline-setup step in the Catalyst web console before the SDK can call it (approved by user).
4. **Data Store** — immutable audit log of every agent run: question, tool calls made, tool args/results, final answer. Separate from operational Postgres.

The legacy `catalyst-functions/` GLM chat REST call is undocumented/unsupported in the current Catalyst SDK — left dead, not revived.

## Data Flow

1. `ChatWindow` posts to `/api/chat` with `X-User-Email` (session auth hardening is a later phase).
2. Route builds system prompt (schema + tool descriptions) and enters the orchestrator loop.
3. Each iteration: Groq returns `tool_calls[]` → executed in parallel (`Promise.all`) → one SSE `step` event per tool `{tool, args, result, status}` → fire-and-forget write to Catalyst Data Store.
4. Loop exits when the model returns no further tool calls, or after 4 iterations (hard cap).
5. Final turn uses `tool_choice: "none"` and streams the narrative token-by-token (existing `token`/`done` SSE events preserved).
6. Client: `MessageBubble` renders the narrative as today; new `CaseBoard` component consumes `step` events live and pins them to a side panel.

## Error Handling

- A failing tool (DB error, Catalyst timeout) does not kill the loop — it returns `{status:"error", message}` as the tool result so the model can route around it or note the limitation in its answer. Shown as a red/failed step in the CaseBoard (visible, not hidden).
- Catalyst Cache/Cron/Data Store calls are best-effort and non-blocking: cache misses fall back to live compute; audit-log write failures are swallowed with a console warning and never surfaced to the user. Core chat must keep working even if Catalyst services are unreachable from local dev.
- Orchestrator loop is hard-capped at 4 iterations; if exhausted without a final answer, one last `tool_choice:"none"` call forces synthesis from whatever's been gathered.

## UI

New persistent **CaseBoard** panel beside the chat column in `dashboard/page.tsx`'s chat view, styled to match the existing "classified case-file" design system (mono font step labels, pin/thumbtack icon, amber-in-progress / green-done / red-failed states). Streams via the same SSE connection as chat tokens (one new event type, no second connection).

## Testing / Verification

No existing test suite. Plan:
- Extend `eval/run.ts` to cover multi-tool agent runs (tool-selection sanity), not just single-shot SQL, using the existing 25 examples plus new multi-tool questions.
- Manual verification per phase via the `verify` skill — drive the real chat UI, not just typecheck.

## Sequencing (single track, sequential, no branches, no commits)

1. Cleanup pass — remove `catalyst-functions/`, `debug-llm` route, `CrimeMap.tsx`; consolidate duplicated theme tokens (`globals.css` vs `ThemeProvider.tsx`)
2. Catalyst Cache integration (embeddings cache + insights cache backend)
3. Catalyst Cron job (insights precomputation)
4. Agent orchestrator core + 4 existing-data tools (demoable on its own)
5. Catalyst QuickML console setup + `predictRisk` tool
6. Catalyst Data Store audit log
7. CaseBoard UI + visual polish pass
8. Trust/safety hardening — real (AST-based) SQL validation, real session auth to replace spoofable `X-User-Email`
9. Final polish — rewrite `AboutView` to reflect actual stack/features, loading states, stretch feature if time remains (voice input, PDF export, geo-temporal correlation view)

## Out of scope

- Migrating operational data off Neon Postgres onto Catalyst Data Store (audit log only, not the FIR system of record)
- Real user-facing auth provider (Clerk/NextAuth) — session hardening stays custom/lightweight
- Voice input, PDF export, geo-temporal correlation view — stretch, only if time remains after step 9
