# TODOS
Status taxonomy for open items: `ready`, `blocked`, `deferred`.


## End-User DX (from /plan-devex-review 2026-04-23)

### Human-Friendly WebContainers Boot Progress [P1, S] — ready
- **What:** Replace raw npm output in `WebContainerBootProgress.tsx` with a human-readable progress message (e.g., "Building your app... 40%") and hide npm package names behind a collapsible "Details" toggle.
- **Why:** Non-technical users see "added 342 packages in 8s" and interpret it as an error or unexpected behavior. The magic moment (first preview) is delayed by a confusing technical preamble.
- **Pros:** Removes the most visually alarming moment in the new-user journey. Aligns with Champion TTHW target. Zero performance cost.
- **Cons:** Progress percentage requires timing data — may need to estimate based on install output line count or fixed phases.
- **Context:** Decided in /plan-devex-review (2026-04-23). Implementation point: `frontend/src/components/PreviewPanel/WebContainerBootProgress.tsx`.
- **Depends on:** None

### Mobile Auto-Switch to Preview After Generation [P1, XS] — ready
- **What:** In `AppLayout.tsx`, watch for `isLoading` transitioning from `true` → `false` when files are present. If the viewport is mobile-width, call `setActivePanel('preview')` automatically.
- **Why:** Mobile users remain on the 'chat' panel after generation and must discover the Preview tab manually. This buries the magic moment — seeing the generated app — behind a manual navigation step.
- **Pros:** ~5 lines. Zero regression risk for desktop (already shows preview in right panel). Eliminates the most common mobile confusion point.
- **Cons:** If a user wants to stay in chat, the auto-switch is mildly disruptive. Can be mitigated by only switching on first generation per session.
- **Context:** Decided in /plan-devex-review (2026-04-23). Implementation point: `frontend/src/components/AppLayout/AppLayout.tsx:109`.
- **Depends on:** None

### Complex Generation Slow Warning [P2, S] — ready
- **What:** In `LoadingIndicator.tsx`, distinguish "complex multi-phase generation is taking its expected time" from "something may actually be wrong." When generation is complex (>10 files), show "Your app has many parts — complex builds typically take 2-4 minutes." at 30s. When simple, keep the "AI service may be under heavy load" message.
- **Why:** The 30s warning fires constantly for complex apps. Users think the AI is broken when it's working correctly. Creates false panic and abandoned sessions.
- **Pros:** Sets accurate expectations. Reduces false support requests.
- **Cons:** Requires passing generation complexity hint from the backend SSE stream to the frontend LoadingIndicator. May need a new SSE event type or metadata field.
- **Context:** Decided in /plan-devex-review (2026-04-23). File: `frontend/src/components/ChatInterface/LoadingIndicator.tsx:131`.
- **Depends on:** Backend SSE stream emitting complexity metadata (or detect via file count from processing phase)

### Auto-Save Indicator in Builder [P2, XS] — ready
- **What:** Show a brief "Saved locally" confirmation after each auto-save to IndexedDB. A small toast or persistent chip in the builder header is sufficient.
- **Why:** Non-technical users close the browser tab thinking they've lost their work. Auto-save is completely silent. A visual indicator builds confidence and reduces re-generation churn.
- **Pros:** ~30 lines. Reuses existing toast system (`ToastContext`).
- **Cons:** None significant. Debounce the indicator to avoid showing on every keystroke.
- **Context:** Decided in /plan-devex-review (2026-04-23). Implementation: wire auto-save callback to `showToast()` in `StorageService`.
- **Depends on:** None

### Human-Readable Error Details Panel [P2, S] — ready
- **What:** In `ErrorOverlay.tsx:101-104`, replace raw `err.message` text (e.g., "TypeError: Cannot read properties of undefined (reading 'map')") with a human-readable summary: "Something went wrong in [component]. Try a simpler request, or use Undo to go back to the last working version."
- **Why:** The "View Details" panel shows raw JavaScript error text that non-technical users can't interpret or act on. The Undo instruction is already the correct CTA — the details should support that decision, not create confusion.
- **Pros:** Reduces panic when auto-repair fails. Reinforces the Undo as the clear next action.
- **Cons:** Requires mapping common error types to plain-language explanations. Raw errors can be hidden under an additional "Show technical details" toggle for devs.
- **Context:** Decided in /plan-devex-review (2026-04-23). File: `frontend/src/components/AppLayout/ErrorOverlay.tsx:101-104`.
- **Depends on:** None

### Feedback Button for End Users [P2, XS] — ready
- **What:** Add a small "Feedback" button in `SiteHeader` linking to GitHub Issues or a Tally/Typeform. The current footer GitHub link is too technical for non-technical users.
- **Why:** Non-technical founders and students who hit a wall have no escalation path. The GitHub link is visible only in the footer and requires understanding GitHub Issues.
- **Pros:** Closes the support gap for non-technical users. Takes ~30 minutes to implement.
- **Cons:** Need to decide on feedback destination (GitHub Issues, Tally form, or mailto).
- **Context:** Decided in /plan-devex-review (2026-04-23). File: `frontend/src/components/SiteHeader/SiteHeader.tsx`.
- **Depends on:** None

### End-User Analytics (TTHW Measurement) [P2, S] — ready
- **What:** Add Plausible or PostHog to track three events: `prompt_submitted`, `generation_complete`, `preview_rendered`. Compute TTHW (time from submit to first preview render). No PII.
- **Why:** The Champion TTHW target (<2 min for all apps) set in /plan-devex-review cannot be validated without instrumentation. The vendor caching and progress bar improvements will have no measurable before/after signal.
- **Pros:** ~2 hours setup. Privacy-friendly (Plausible sends no user data). Enables data-driven DX iteration.
- **Cons:** Adds an external script dependency. Self-hosted Plausible option avoids third-party data sharing.
- **Context:** Decided in /plan-devex-review (2026-04-23).
- **Depends on:** None


## Architecture (from /plan-ceo-review EXPANSION on 2026-03-23)

### Unified Pipeline Architecture — Completed
- **Status:** Completed (2026-04-14, commit c91078b)
- **What was done:** Merged `GenerationPipeline` and `PipelineOrchestrator` into `UnifiedPipeline<TContext, TResult>` via Strategy pattern. New files: `unified-pipeline.ts`, `pipeline-strategy.ts`, `generation-strategy.ts`, `modification-strategy.ts`, `pipeline-shared.ts`. Deleted `generation-pipeline.ts` and `pipeline-orchestrator.ts`. Extracted shared intent stage into `runIntentStage()` shared function, eliminating ~110 LOC of duplication. All 2085 backend tests pass.

### WebContainers Preview Migration — Completed
- **Status:** Completed (2026-04-14, commit 935dfe4)
- **What was done:** Replaced `@codesandbox/sandpack-react` with `@webcontainer/api`. New `useWebContainer` hook manages singleton boot lifecycle (booting→mounting→installing→starting→ready). Incremental `fs.writeFile()` for HMR-based minor updates; full remount for new projects. COOP `same-origin` + COEP `credentialless` headers in Vite config. New UI components: `WebContainerBootProgress`, `WebContainerPreview`, `WebContainerConsole`, `WebContainerErrorListener`. All auto-repair, error aggregation, and device frame behavior preserved. FullstackBanner updated — API routes now run live.

### Server-Side Agent Sessions — Completed (Reliable Continuation v1)
- **Status:** Completed (2026-04-15, v1.10.0)
- **What was done:** `project_sessions` + `session_messages` tables with RLS policies. `session-service.ts` exposes `getOrCreateSession`, `appendTurn` (fire-and-forget), `getLastKTurns`. Both `generate-stream` and `modify-stream` inject the last 8 turns as a `[CONVERSATION HISTORY]` block. Admin session viewer endpoints: list (keyset-paginated), transcript (capped at 500 msgs), export. See `specs/reliable-continuation.md` for full design. Follow-on TODOs for repair turn injection, search, and atomic turn_count are tracked below.

## Test Coverage Gaps

### Incremental JSON Parser Test Suite [P1, M] — Completed
- **What was done:** Added parser test coverage in `backend/lib/__tests__/utils/incremental-json-parser.test.ts` and performance coverage in `backend/lib/__tests__/utils/incremental-json-parser.perf.test.ts` covering complete/incomplete streams, malformed chunks, wrapper extraction, and throughput/complexity checks.
- **Status:** Completed (backfilled in TODO log on 2026-04-14)

## Observability

### Smart Error Explanations — Completed
- **Status:** Completed (implemented on 2026-04-14)
- **What:** When auto-repair triggers, produce a one-sentence human-readable explanation of what was fixed — e.g., "Fixed: the Button component was imported from the wrong path."
- **Why:** Builds trust ("the AI knows what it's doing") and educates non-technical users. The repair engine already knows what it fixed; just format and surface it.
- **Context:** Vision item from /plan-ceo-review EXPANSION on 2026-03-23. ~2 hours effort. Integration: `DiagnosticRepairEngine` + `ErrorOverlay`.
- **Depends on:** None


## Performance Observability (deferred from generation speed optimization, 2026-03-27)

### Generation Pipeline Stage Timing [P2, S]
- **Status:** `deferred`
- **What:** Add per-stage P50/P95 timing to the existing metrics system for the generation pipeline (intent, planning, plan-review, each execution phase, post-processing).
- **Why:** The generation speed optimization was built on estimated savings (2-6s, 5-10s, etc.) without real baseline data. Without timing instrumentation, it's impossible to validate the 20% claim or guide future optimization rounds.
- **Pros:** Validates speedup claims. Catches performance regressions automatically. Exposes via existing `/api/health?metrics=true`. Zero new infrastructure.
- **Cons:** ~20 lines of metrics code per stage.
- **Context:** The pipeline already logs `durationMs` per stage via `contextLogger.info`. This TODO formalizes it as histograms via the existing `recordOperation()` / `getMetricsSummary()` in `backend/lib/metrics.ts`. Should be done after the speed optimization ships so you have before/after data.
- **Depends on:** Generation speed optimization (this plan)

### Separate Complexity Gate Thresholds [P3, XS]
- **Status:** `deferred` (depends on Generation Pipeline Stage Timing)
- **What:** Use separate constants for "skip plan review threshold" (currently `COMPLEXITY_GATE_FILE_THRESHOLD`) and "use one-shot threshold" (currently same constant). Currently both gate at <=10 files, compounding safety net removal.
- **Why:** Allows independent tuning of when to skip review vs. when to use one-shot execution. E.g., skip review at <=6 files, one-shot at <=8 files.
- **Pros:** Finer-grained control of risk/speed tradeoff at the 8-10 file boundary.
- **Cons:** Two constants to reason about. Low priority — current behavior is safe.
- **Context:** Deferred from generation speed optimization plan (2026-03-27). Threshold tuning should be informed by real timing data from the observability TODO above.
- **Depends on:** Generation Pipeline Stage Timing (need data to pick the right values)

## Validation Enhancements (deferred from modification & repair pipeline)

### AST-based syntax validation — Completed
- **Status:** Completed (implemented on 2026-04-14)
- **What:** Use `acorn` or `@babel/parser` for JS/TS/JSX parsing instead of regex bracket-balancing in `build-validator.ts`
- **Why:** Current regex-based checker misses unclosed JSX tags, malformed arrow functions, and invalid hook usage patterns. AST parsing catches these at build-validation time instead of waiting for Sandpack runtime errors, saving an auto-repair cycle.
- **Context:** Deferred from Phase 4 of the modification & repair pipeline plan (2026-03-21). Integration point: `backend/lib/core/validators/syntax-validator.ts`.
- **Depends on:** None (independent enhancement)

### CSS consistency checking — Completed
- **Status:** Completed (implemented on 2026-04-14)
- **What:** Validate CSS file syntax (balanced braces, valid selectors) and cross-reference `className` usage in JSX with defined CSS classes
- **Why:** CSS errors are a real failure mode in generated code. Currently only caught at Sandpack runtime, wasting an auto-repair cycle.
- **Context:** Deferred from Phase 4 of the modification & repair pipeline plan (2026-03-21). New validator at `backend/lib/core/validators/css-validator.ts`.
- **Depends on:** None (independent enhancement)

### Incremental validation
- **Status:** `ready`
- **What:** Only validate changed files + their direct dependents instead of the full project in `BuildValidator`
- **Why:** Performance optimization for projects with 20+ files. Currently validation runs on all files even when only 1 changed.
- **Context:** Deferred from Phase 4 of the modification & repair pipeline plan (2026-03-21). Uses `DependencyGraph` to determine validation scope.
- **Depends on:** None (prerequisite `DependencyGraph` extensions shipped in v1.3.0)

## Blank Canvas Admin (managed platform for instructors/trainers/organizations)

*Design doc locked. Architecture reviewed (/plan-eng-review 2026-04-04). Ready to implement.*

### Per-Workspace Token Budget Enforcement [P2, M]
- **Status:** `blocked` (depends on Admin v1 rollout confirmation and token-count plumbing)
- **What:** Add per-member daily token cap stored on the Workspace table. Enforce in `/api/generate-stream` and `/api/modify-stream` before decrypting the org API key.
- **Why:** One active member can exhaust the org's upstream API quota for the entire class with no guard. Results in "why is everyone's generation broken?" incidents during class.
- **Pros:** Prevents runaway usage, gives admin visibility into per-member consumption. Token counts tracked via `generation_events.token_count` (populated by the token count TODO above).
- **Cons:** Requires token counter storage (Redis or Supabase) and a new admin UI panel.
- **Context:** Deferred from Blank Canvas Admin v1 (2026-04-04).
- **Depends on:** Blank Canvas Admin v1 shipped

### Per-Generation Token Counts in generation_events [P3, S]
- **Status:** `blocked` (depends on unified token accumulation + provider usage exposure)
- **What:** Populate `token_count` column (currently NULL) with actual input+output tokens per generation event.
- **Why:** Token visibility panel in AdminWorkspacePage shows `--` until this is done. Blocked on providers exposing per-generation token totals.
- **Pros:** Completes the metrics panel. Enables token-budget enforcement feature downstream.
- **Cons:** Requires AI provider interface change — `generate()` response needs to expose token counts. Not all OpenRouter models return usage data consistently.
- **Context:** Deferred from Beginner Mode sprint (2026-04-09). `token_count` column already exists in `generation_events` table, stored as NULL for now.
- **Depends on:** Unified Pipeline Architecture TODO (single token accumulation point), provider token exposure in `ai-provider.ts` interface

### beginnerMode enforcement in /generate (non-streaming) route [P3, XS]
- **Status:** `ready`
- **What:** Mirror the workspace resolver + beginnerMode wiring from `/api/generate-stream` into `/api/generate` (the non-streaming route).
- **Why:** `/generate` is a secondary code path. If a workspace member calls it directly, beginnerMode is bypassed silently.
- **Pros:** Complete enforcement parity. ~20 lines of code.
- **Cons:** Low priority — the product UI always uses `/generate-stream`. `/generate` is only reachable via direct API call.
- **Context:** Deferred from Beginner Mode sprint (2026-04-09). Codex outside-voice review flagged this during /plan-eng-review.
- **Depends on:** Beginner Mode sprint shipped

### Admin API Key Health Indicator [P2, S]
- **Status:** `ready`
- **What:** `OrgSettingsPage` shows API key status (valid / invalid / unknown) with a "Test connection" button that probes OpenRouter with a minimal request before storing.
- **Why:** When the org's API key is invalid or exhausted, all 30 students fail simultaneously with no notification path to the admin.
- **Pros:** ~2 hours of work. Prevents classroom disruption. Builds admin trust in the platform.
- **Cons:** Adds a probe call on demand (not on hot generation path — no performance impact).
- **Context:** Deferred from Blank Canvas Admin v1 (2026-04-04). Validation probe partially designed in design doc Open Questions #6.
- **Depends on:** Blank Canvas Admin v1 shipped

## WebContainers Phase 2 (deferred from /plan-eng-review 2026-04-08)

### Vendor Bundle Caching [P2, M]
- **Status:** `blocked` (depends on WebContainers Phase 1 in production)
- **What:** After a successful npm install inside WebContainers, snapshot the `node_modules` filesystem tree in memory. On subsequent boots for the same project, restore the snapshot before spawning `npm install` (which then becomes a fast no-op check). Reduces warm boot from 5-15s to ~2s.
- **Why:** Students regenerating mid-session wait 5-15s per regeneration. The vendor set rarely changes between edits. Caching makes the second and all subsequent boots feel instant.
- **Pros:** Massive UX improvement for classroom sessions. No server cost — all client-side memory. Zero API changes.
- **Cons:** Memory footprint per project (node_modules can be 50-100MB in the browser filesystem). Need eviction strategy for multiple open projects.
- **Context:** Deferred from WebContainers migration Phase 1. Phase 1 accepts cold-boot latency (~15s) and defers caching. WebContainers `wc.fs` has snapshot/restore capabilities. Implementation point: `PreviewPanel.tsx` boot lifecycle.
- **Depends on:** WebContainers Phase 1 migration shipped and validated in production

### Remove Sandpack + StackBlitz SDK [P2, XS]
- **Status:** `blocked` (depends on WebContainers Phase 1 validation + classroom pilot)
- **What:** Remove `@codesandbox/sandpack-react` and `@stackblitz/sdk` from `frontend/package.json` after WebContainers migration validates in production. Both packages become dead code post-migration.
- **Why:** Dead dependencies add ~500KB to the frontend bundle and create security surface area for no benefit.
- **Pros:** Bundle size reduction. Cleaner dependency tree.
- **Cons:** None after Phase 1 validates.
- **Context:** Cannot remove before validation — kept as a rollback option in case WebContainers has unexpected production issues. Remove only after successful classroom pilot confirms stability.
- **Depends on:** WebContainers Phase 1 shipped + classroom pilot completed (Success Criterion #3)

### COOP/COEP Audit for Cross-Origin Resources [P1, S — pre-deploy gate]
- **Status:** `deferred` (pre-deploy gate for WebContainers production rollout)
- **What:** Before enabling `Cross-Origin-Embedder-Policy: require-corp` in the production Vercel/Netlify config, audit every external resource loaded by the frontend (Google Fonts, CDN images, any third-party embeds). Any resource missing `Cross-Origin-Resource-Policy` headers will silently fail to load under COEP.
- **Why:** COEP `require-corp` breaks any cross-origin resource that hasn't opted in. If this audit is skipped, fonts and images may disappear silently in production with no visible error in the console.
- **Pros:** Prevents silent production breakage. ~30-minute one-time audit. Can use browser DevTools Network tab to scan for cross-origin resources.
- **Cons:** Small manual effort required.
- **Context:** This is a **pre-deployment gate** — must be done BEFORE enabling COEP headers in the production hosting config (Vercel `vercel.json` or Netlify `_headers`). The Vite dev server COEP header (for local development) can be added safely first. The production header requires this audit.
- **Depends on:** None (independent audit step before WebContainers production deployment)

## Per-Project Conversation History — Deferred Items (from /plan-ceo-review 2026-04-14)

### Repair Context Injection into AI Prefix [P2, S]
- **Status:** `ready` (depends on Per-Project Conversation History shipped + validated in production)
- **What:** When building the `conversationHistoryPrefix` for each AI call, include turns where `repair_triggered=true` alongside regular user/assistant turns. Currently, repair turns are stored in `session_messages` with `repair_triggered=true` but not injected into the AI context prefix.
- **Why:** The AI would know what it tried to fix previously, preventing it from repeating the same broken pattern in the next generation. Turns repair history from an audit trail into a learning signal.
- **Pros:** ~10 lines in `session-service.getLastKTurns()` — just stop filtering out repair turns. Same data, already stored.
- **Cons:** Increases context size per turn. Repair turns can be verbose (full error + fix explanation). May need `repair_triggered` turns to count as 2x weight toward K.
- **Context:** Deferred from Reliable Continuation sprint (2026-04-14). `repair_triggered` and `repair_explanation` columns are in the schema from day one; the injection is what's deferred. CEO plan: `~/.gstack/projects/edge555-ai-builder-app/ceo-plans/2026-04-14-reliable-continuation.md`
- **Depends on:** Per-Project Conversation History shipped and validated

### Per-Session Token Usage Panel in Admin Transcript View [P3, M]
- **Status:** `blocked` (depends on Per-Generation Token Counts TODO)
- **What:** Show per-session token consumption in the AdminWorkspacePage transcript view — total tokens used per student session, broken down by turn.
- **Why:** Instructors and program directors can see which students are heavy AI users and whether token budgets are being approached. Connects session data to the token budget enforcement feature.
- **Pros:** Same data as Per-Generation Token Counts, just surfaced in the transcript view.
- **Cons:** Blocked on providers exposing per-generation token totals (same blocker as the existing Per-Generation Token Counts TODO).
- **Context:** Deferred from Reliable Continuation sprint (2026-04-14). Don't block session history on this.
- **Depends on:** Per-Generation Token Counts in generation_events (already deferred, P3)

### Full-Text Search on Session Messages [P3, M]
- **Status:** `ready` (GIN index is in the initial migration; query endpoint and UI deferred)
- **What:** `GET /api/admin/sessions/search?q=<query>&workspaceId=<wid>` — search across session messages using Postgres full-text search. Admin UI: search box in AdminWorkspacePage transcript view.
- **Why:** Instructor wants to find all sessions where a student asked about "useState" or had an error about "undefined." The GIN index makes this a simple `@@` query on `to_tsvector`.
- **Pros:** The hardest part (GIN index) is already in the migration. The query is ~5 lines of SQL.
- **Cons:** GIN index covers all turns (append-only schema — no deletion). Full archive search works natively.
- **Context:** Deferred from Reliable Continuation sprint (2026-04-14). GIN index included in migration to avoid `CONCURRENTLY` later. Append-only schema means all turns are searchable.
- **Depends on:** Per-Project Conversation History shipped

### Rolling Summary / Row Eviction [P3, M]
- **Status:** `deferred` (depends on Per-Project Conversation History shipped + storage costs measurable in prod)
- **What:** After session history is validated in production, add rolling summary + deletion if storage costs become a concern. Approach: Supabase Edge Function triggered by Postgres trigger on `project_sessions.turn_count` at multiples of N (tune based on real data — start with 200 turns). Summarize oldest 100 turns via AI into one paragraph, store in `project_sessions.summary`, delete those rows atomically via `update_session_summary(session_id, summary_text)` Postgres function. Use soft-delete (`summarized BOOLEAN`) instead of hard-delete if compliance export coverage matters.
- **Why:** v1 ships append-only (correct choice at classroom session scale — 50-100 turns ≈ 50KB per session). This becomes relevant only if storage costs grow with usage or sessions exceed 200+ turns.
- **Pros:** Bounded storage model for long-running or frequently-used sessions.
- **Cons:** 4 moving parts (trigger + Edge Function + RPC function + secret config). Edge Function needs `OPENROUTER_API_KEY` as Supabase secret. Atomic RPC required to prevent partial failures.
- **Context:** Designed during Reliable Continuation eng review (2026-04-14) but intentionally deferred — append-only is simpler and sufficient at launch scale. Full design is in CEO plan: `~/.gstack/projects/edge555-ai-builder-app/ceo-plans/2026-04-14-reliable-continuation.md`.
- **Depends on:** Per-Project Conversation History shipped and validated; real storage data from prod

### Remove Client-Side Full-History-Rebuild [P2, XS]
- **Status:** `ready` (depends on Per-Project Conversation History validated in production classroom)
- **What:** Remove the full-history-rebuild logic from `ChatMessagesContext` that sends all prior user messages with each request. v1 runs both in parallel (backend session primary, client history fallback). Once backend sessions are validated in one real classroom session, remove the client-side path.
- **Why:** Dead code path adds complexity and sends redundant data with every request. Backend session history is the authoritative source once validated.
- **Pros:** ~30-50 lines removed from `ChatMessagesContext`. Cleaner request payload. No more client-side history state to manage.
- **Cons:** Audit required before removal — retry and error-recovery logic in `ChatInterface` may depend on client-side history. Don't remove blindly.
- **Context:** Deferred from Reliable Continuation sprint (2026-04-14). Design doc specifies parallel operation for first release. CEO plan has the transition strategy.
- **Depends on:** Per-Project Conversation History shipped and validated in at least one production classroom session

### Session Export Streaming for Large Sessions [P3, S]
- **Status:** `ready` (depends on Per-Project Conversation History shipped; activate if sessions exceed 200+ turns)
- **What:** Add streaming/pagination to `GET /api/admin/sessions/:sessionId/export` for large sessions. Current implementation returns all rows in one response — will timeout for 500+ turns. Fix: stream NDJSON (`Content-Type: application/x-ndjson`) or add `?limit=&offset=` query params.
- **Why:** Classroom sessions at launch are 50-100 turns (fine). Multi-hour workshops or power users could hit 500+ turns. Timeout with no error message is a bad instructor experience.
- **Pros:** Prevents silent export failures for large sessions.
- **Cons:** NDJSON changes the response format (minor breaking change vs. planned JSON array). Pagination adds complexity to the admin UI download button.
- **Context:** Flagged during Reliable Continuation eng review (2026-04-14). Theoretical at launch scale. Activate only if real sessions start hitting timeouts.
- **Depends on:** Per-Project Conversation History shipped

## Completed

### GenerationContext Decomposition [v1.8.1 — 2026-04-07]
- **What was done:** Split the 701-line `GenerationContext.tsx` into `generationApiService.ts` (API calls + streaming), `repairService.ts` (auto-repair retry logic), `streamingTransport.ts` (SSE lifecycle + snapshot normalization), and `types.ts`. Provider reduced to ~185 lines owning only UI state. Two bugs fixed in the process: unconditional `onStreamingChange(false)` race and repair dedup blocking all retries after the first. Unit tests added for all three service modules.
- **Completed:** v1.8.1 (2026-04-07)

### Incremental JSON Parser — SSE Warning Events [v1.8.0 — 2026-04-06]
- **What was done:** Added `ParseWarning` type, duplicate file detection (`seenPaths`), and invalid object detection to `incremental-json-parser.ts`. `streaming-generator.ts` now forwards pipeline warnings via `callbacks.onWarning`.
- **Completed:** v1.8.0 (2026-04-06)
