# TODOS

## Architecture (from /plan-ceo-review EXPANSION on 2026-03-23)

### Unified Pipeline Architecture [P1, L]
- **What:** Merge `GenerationPipeline` (580 LOC) and `PipelineOrchestrator` (709 LOC) into a single configurable pipeline with strategy objects for "new project" vs "modification" behavior.
- **Why:** Dual pipelines duplicate Intent, Planning, and Review stages. Every improvement must be manually replicated. The unified pipeline becomes the single extension point for agentic features (tool use, session context, self-testing).
- **Pros:** Single codepath to maintain, ~500 LOC reduction, enables all Phase 2/3 features.
- **Cons:** Significant refactor touching generation and modification paths. Risk of regression in both flows.
- **Context:** Both pipelines follow Intent→Planning→Execution→Review. Execution differs (multi-phase batched vs single-phase). Strategy pattern handles this. Files: `backend/lib/core/generation-pipeline.ts`, `backend/lib/core/pipeline-orchestrator.ts`.
- **Depends on:** CI/CD pipeline (tests must pass before merging)

### WebContainers Preview Migration [P1, XL]
- **What:** Replace Sandpack with WebContainers (StackBlitz's open-source browser-based Node.js runtime) for the preview panel. Enables running real Node.js servers, npm installs, and fullstack applications in the browser.
- **Why:** Sandpack can only run client-side JavaScript. This permanently caps the product at React SPAs. WebContainers unlock Next.js, Express, database-connected apps — the fullstack recipes currently behind `ENABLE_FULLSTACK_RECIPES` feature flag.
- **Pros:** Massive capability unlock. Zero server cost (runs in browser). Already have StackBlitz SDK integration. Differentiates from Sandpack-based competitors.
- **Cons:** WebContainers API differs from Sandpack. Requires rewriting preview panel, error listener, and auto-repair integration. Browser compatibility (Chrome/Edge only for some features).
- **Context:** StackBlitz SDK already imported in frontend. Files: `frontend/src/components/PreviewPanel/`.
- **Depends on:** Unified pipeline (for consistent fullstack generation)

### Server-Side Agent Sessions [P2, XL]
- **What:** Add a backend session layer that stores conversation context per project. The AI can reference prior turns, tool results (test output, error history), and accumulated context without the frontend rebuilding everything.
- **Why:** Current stateless model (frontend sends full history each request) can't support agentic multi-turn workflows. The 10-star experience is an AI that remembers what it tried, uses tools, and iteratively refines.
- **Pros:** Enables tool use (run tests, check errors), context accumulation, iterative refinement. Foundation for self-testing and deployment.
- **Cons:** Requires session storage (Redis or database), connection management, session cleanup. Adds backend state.
- **Context:** Builds on unified pipeline. Session stores conversation + tool registry per project.
- **Depends on:** Unified pipeline, WebContainers (tools need execution environment)

### GenerationContext Decomposition [P1, M]
- **What:** Split the 701-line `GenerationContext.tsx` into 3 layers: `StreamingContext` (SSE transport + connection), `GenerationApiService` (API calls + retry, plain class not React context), `GenerationUiContext` (thin state for UI rendering).
- **Why:** GenerationContext handles 5 responsibilities in one file. Every new feature (agent sessions, tool use) will make it larger. The decomposition aligns with the agentic architecture — StreamingContext becomes the transport layer for agent sessions.
- **Pros:** Reduces re-render blast radius, testable service layer, cleaner separation, scales with features.
- **Cons:** Requires updating all consumers (ChatInterface, AppLayout, AutoRepairProvider).
- **Context:** Currently the largest frontend file. File: `frontend/src/context/GenerationContext.tsx`.
- **Depends on:** None (can be done independently)

## Test Coverage Gaps

### Incremental JSON Parser Test Suite [P1, M]
- **What:** Write comprehensive tests for the backend's incremental JSON parser covering: valid streaming, malformed chunks, partial files, encoding edge cases, empty responses. Add SSE warning events when files are skipped during parsing.
- **Why:** This parser processes every byte of AI output (403 MB/s, O(n)). It has ZERO test files. If it silently loses files, users see broken apps with no error message. Most dangerous untested critical path.
- **Pros:** Catches silent data loss bugs. SSE warnings surface parsing issues to users.
- **Cons:** None — tests are purely additive.
- **Context:** Parser at `backend/lib/utils/`. Streaming integration in `backend/lib/core/streaming-generator.ts`.
- **Depends on:** None

## Observability

### Smart Error Explanations
- **What:** When auto-repair triggers, produce a one-sentence human-readable explanation of what was fixed — e.g., "Fixed: the Button component was imported from the wrong path."
- **Why:** Builds trust ("the AI knows what it's doing") and educates non-technical users. The repair engine already knows what it fixed; just format and surface it.
- **Context:** Vision item from /plan-ceo-review EXPANSION on 2026-03-23. ~2 hours effort. Integration: `DiagnosticRepairEngine` + `ErrorOverlay`.
- **Depends on:** None


## Performance Observability (deferred from generation speed optimization, 2026-03-27)

### Generation Pipeline Stage Timing [P2, S]
- **What:** Add per-stage P50/P95 timing to the existing metrics system for the generation pipeline (intent, planning, plan-review, each execution phase, post-processing).
- **Why:** The generation speed optimization was built on estimated savings (2-6s, 5-10s, etc.) without real baseline data. Without timing instrumentation, it's impossible to validate the 20% claim or guide future optimization rounds.
- **Pros:** Validates speedup claims. Catches performance regressions automatically. Exposes via existing `/api/health?metrics=true`. Zero new infrastructure.
- **Cons:** ~20 lines of metrics code per stage.
- **Context:** The pipeline already logs `durationMs` per stage via `contextLogger.info`. This TODO formalizes it as histograms via the existing `recordOperation()` / `getMetricsSummary()` in `backend/lib/metrics.ts`. Should be done after the speed optimization ships so you have before/after data.
- **Depends on:** Generation speed optimization (this plan)

### Separate Complexity Gate Thresholds [P3, XS]
- **What:** Use separate constants for "skip plan review threshold" (currently `COMPLEXITY_GATE_FILE_THRESHOLD`) and "use one-shot threshold" (currently same constant). Currently both gate at <=10 files, compounding safety net removal.
- **Why:** Allows independent tuning of when to skip review vs. when to use one-shot execution. E.g., skip review at <=6 files, one-shot at <=8 files.
- **Pros:** Finer-grained control of risk/speed tradeoff at the 8-10 file boundary.
- **Cons:** Two constants to reason about. Low priority — current behavior is safe.
- **Context:** Deferred from generation speed optimization plan (2026-03-27). Threshold tuning should be informed by real timing data from the observability TODO above.
- **Depends on:** Generation Pipeline Stage Timing (need data to pick the right values)

## Validation Enhancements (deferred from modification & repair pipeline)

### AST-based syntax validation
- **What:** Use `acorn` or `@babel/parser` for JS/TS/JSX parsing instead of regex bracket-balancing in `build-validator.ts`
- **Why:** Current regex-based checker misses unclosed JSX tags, malformed arrow functions, and invalid hook usage patterns. AST parsing catches these at build-validation time instead of waiting for Sandpack runtime errors, saving an auto-repair cycle.
- **Context:** Deferred from Phase 4 of the modification & repair pipeline plan (2026-03-21). Integration point: `backend/lib/core/validators/syntax-validator.ts`.
- **Depends on:** None (independent enhancement)

### CSS consistency checking
- **What:** Validate CSS file syntax (balanced braces, valid selectors) and cross-reference `className` usage in JSX with defined CSS classes
- **Why:** CSS errors are a real failure mode in generated code. Currently only caught at Sandpack runtime, wasting an auto-repair cycle.
- **Context:** Deferred from Phase 4 of the modification & repair pipeline plan (2026-03-21). New validator at `backend/lib/core/validators/css-validator.ts`.
- **Depends on:** None (independent enhancement)

### Incremental validation
- **What:** Only validate changed files + their direct dependents instead of the full project in `BuildValidator`
- **Why:** Performance optimization for projects with 20+ files. Currently validation runs on all files even when only 1 changed.
- **Context:** Deferred from Phase 4 of the modification & repair pipeline plan (2026-03-21). Uses `DependencyGraph` to determine validation scope.
- **Depends on:** None (prerequisite `DependencyGraph` extensions shipped in v1.3.0)
