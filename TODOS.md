# TODOS

## Design Debt

### Image attachment strip: horizontal scroll on mobile
- **What:** Add `overflow-x: auto` + fade-edge gradient to `.chat-attachment-strip` for mobile viewports (<768px)
- **Why:** With 5 image thumbnails on a 375px screen, the strip overflows. Horizontal scroll with a fade hint on the right edge is the agreed UX pattern.
- **Context:** Decided during /plan-design-review on 2026-03-21.
- **Depends on:** ChatInput image attachment markup (already implemented in this branch)

### Phase progress: warning color for degraded stages
- **What:** Wire SSE `degraded` status through `sse-parser.ts` → `GenerationContext` → progress label CSS class. Use DESIGN.md Warning color (`#B45309`) for degraded phase text.
- **Why:** When a pipeline phase fails/degrades (e.g., plan review fails, execution retries), users currently see the same neutral progress text. Warning-colored text distinguishes normal progress from fallback behavior.
- **Context:** Decided during /plan-design-review on 2026-03-21. The backend already emits `degraded` status in SSE events; the frontend ignores it.
- **Depends on:** `phase-start`/`phase-complete` SSE events (already implemented in this branch)

## Validation Enhancements (deferred from modification & repair pipeline)

### AST-based syntax validation
- **What:** Use `acorn` or `@babel/parser` for JS/TS/JSX parsing instead of regex bracket-balancing in `build-validator.ts`
- **Why:** Current regex-based checker misses unclosed JSX tags, malformed arrow functions, and invalid hook usage patterns. AST parsing catches these at build-validation time instead of waiting for Sandpack runtime errors, saving an auto-repair cycle.
- **Context:** Deferred from Phase 4 of the modification & repair pipeline plan (2026-03-21). See `specs/modification-repair-pipeline.md`. Integration point: `backend/lib/core/validators/syntax-validator.ts`.
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
