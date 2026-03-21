# TODOS

## Design Debt

### Image attachment strip: horizontal scroll on mobile
- **What:** Add `overflow-x: auto` + fade-edge gradient to `.chat-attachment-strip` for mobile viewports (<768px)
- **Why:** With 5 image thumbnails on a 375px screen, the strip overflows. Horizontal scroll with a fade hint on the right edge is the agreed UX pattern.
- **Context:** Decided during /plan-design-review on 2026-03-21. See `specs/generation-pipeline-rewrite.md` → Frontend Design Decisions → Responsive Behavior.
- **Depends on:** ChatInput image attachment markup (already implemented in this branch)

### Phase progress: warning color for degraded stages
- **What:** Wire SSE `degraded` status through `sse-parser.ts` → `GenerationContext` → progress label CSS class. Use DESIGN.md Warning color (`#B45309`) for degraded phase text.
- **Why:** When a pipeline phase fails/degrades (e.g., plan review fails, execution retries), users currently see the same neutral progress text. Warning-colored text distinguishes normal progress from fallback behavior.
- **Context:** Decided during /plan-design-review on 2026-03-21. The backend already emits `degraded` status in SSE events; the frontend ignores it.
- **Depends on:** `phase-start`/`phase-complete` SSE events (already implemented in this branch)
