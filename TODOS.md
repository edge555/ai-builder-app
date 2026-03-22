# TODOS

## Design Debt

### Image attachment strip: below-textarea horizontal scroll
- **What:** Move `.chat-input-thumbnails` below the textarea (between textarea and submit button). Replace `flex-wrap: wrap` with `overflow-x: auto; flex-wrap: nowrap`. Add a right-edge fade gradient when images overflow.
- **Why:** With 5 image thumbnails on a 375px screen, the current above-textarea wrap creates an unpredictably tall input area. Horizontal scroll with a fade hint is the agreed UX pattern. The strip below the textarea keeps input area height stable.
- **Context:** Originally decided during /plan-design-review on 2026-03-21. Layout direction (below textarea, not above) decided during /plan-design-review on 2026-03-22. Affects `ChatInput.tsx` and `ChatInterface.css`.
- **Depends on:** ChatInput image attachment markup (already implemented)

### Phase progress: warning color for degraded stages
- **What:** Wire SSE `degraded` status through `sse-parser.ts` → `GenerationContext` → progress label CSS class. Use DESIGN.md Warning color (`#B45309`) for degraded phase text.
- **Why:** When a pipeline phase fails/degrades (e.g., plan review fails, execution retries), users currently see the same neutral progress text. Warning-colored text distinguishes normal progress from fallback behavior.
- **Context:** Decided during /plan-design-review on 2026-03-21. The backend already emits `degraded` status in SSE events; the frontend ignores it.
- **Depends on:** `phase-start`/`phase-complete` SSE events (already implemented)

### Onboarding: assembled prompt preview on Step 3
- **What:** On Step 3 (Design style) of the onboarding wizard, display a read-only preview of the assembled prompt below the style choices. User sees exactly what will be sent before clicking "Generate App".
- **Why:** The wizard silently fires a prompt assembled from choices without showing the user what was built. Users have no chance to review or catch unexpected combinations before generation starts. Trust is earned at the pixel level.
- **Context:** Decided during /plan-design-review on 2026-03-22. `buildPromptFromChoices()` already returns the string — just display it in a styled `<pre>` or `<blockquote>` element above the actions row.
- **Depends on:** OnboardingOverlay Step 3 UI (already implemented)

## Infrastructure

### Health check: API key validity probe
- **What:** Add an optional API key validation step to the health route's deep check (`?deep=true`). For OpenRouter, probe `/api/v1/auth/key` with the configured API key to verify it's valid, not just that the endpoint is reachable.
- **Why:** The health check was updated (c6b7c91) to use the public `/models` endpoint without auth — a good change for reachability, but it means a revoked/expired API key still returns a healthy status until the first generation request fails.
- **Context:** Decided during /plan-eng-review on 2026-03-22. The `?deep=true` flag already triggers a provider probe in `backend/app/api/health/route.ts`. Add key validation as a separate step in the deep check path. Should not block the shallow health check (no `?deep=true`).
- **Depends on:** None (independent addition to health route)

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
