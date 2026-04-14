# TODOS
Status taxonomy for open items: `ready`, `blocked`, `deferred`.


## Architecture (from /plan-ceo-review EXPANSION on 2026-03-23)

### Unified Pipeline Architecture — Completed
- **Status:** Completed (2026-04-14, commit c91078b)
- **What was done:** Merged `GenerationPipeline` and `PipelineOrchestrator` into `UnifiedPipeline<TContext, TResult>` via Strategy pattern. New files: `unified-pipeline.ts`, `pipeline-strategy.ts`, `generation-strategy.ts`, `modification-strategy.ts`, `pipeline-shared.ts`. Deleted `generation-pipeline.ts` and `pipeline-orchestrator.ts`. Extracted shared intent stage into `runIntentStage()` shared function, eliminating ~110 LOC of duplication. All 2085 backend tests pass.

### WebContainers Preview Migration — Completed
- **Status:** Completed (2026-04-14, commit 935dfe4)
- **What was done:** Replaced `@codesandbox/sandpack-react` with `@webcontainer/api`. New `useWebContainer` hook manages singleton boot lifecycle (booting→mounting→installing→starting→ready). Incremental `fs.writeFile()` for HMR-based minor updates; full remount for new projects. COOP `same-origin` + COEP `credentialless` headers in Vite config. New UI components: `WebContainerBootProgress`, `WebContainerPreview`, `WebContainerConsole`, `WebContainerErrorListener`. All auto-repair, error aggregation, and device frame behavior preserved. FullstackBanner updated — API routes now run live.

### Server-Side Agent Sessions [P2, XL]
- **Status:** `ready` (Unified Pipeline + WebContainers completed 2026-04-14)
- **What:** Add a backend session layer that stores conversation context per project. The AI can reference prior turns, tool results (test output, error history), and accumulated context without the frontend rebuilding everything.
- **Why:** Current stateless model (frontend sends full history each request) can't support agentic multi-turn workflows. The 10-star experience is an AI that remembers what it tried, uses tools, and iteratively refines.
- **Pros:** Enables tool use (run tests, check errors), context accumulation, iterative refinement. Foundation for self-testing and deployment.
- **Cons:** Requires session storage (Redis or database), connection management, session cleanup. Adds backend state.
- **Context:** Builds on unified pipeline. Session stores conversation + tool registry per project.
- **Depends on:** Unified pipeline, WebContainers (tools need execution environment)

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

## Completed

### GenerationContext Decomposition [v1.8.1 — 2026-04-07]
- **What was done:** Split the 701-line `GenerationContext.tsx` into `generationApiService.ts` (API calls + streaming), `repairService.ts` (auto-repair retry logic), `streamingTransport.ts` (SSE lifecycle + snapshot normalization), and `types.ts`. Provider reduced to ~185 lines owning only UI state. Two bugs fixed in the process: unconditional `onStreamingChange(false)` race and repair dedup blocking all retries after the first. Unit tests added for all three service modules.
- **Completed:** v1.8.1 (2026-04-07)

### Incremental JSON Parser — SSE Warning Events [v1.8.0 — 2026-04-06]
- **What was done:** Added `ParseWarning` type, duplicate file detection (`seenPaths`), and invalid object detection to `incremental-json-parser.ts`. `streaming-generator.ts` now forwards pipeline warnings via `callbacks.onWarning`.
- **Completed:** v1.8.0 (2026-04-06)
