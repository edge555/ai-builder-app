# Spec: Multi-page Accuracy & Token Reduction

**Branch:** `improve-modification`
**Status:** Ready to implement

## Context

Modifications on multi-page projects are inaccurate because:
1. The AI has **no structural awareness** — it doesn't see the route tree, type definitions, or component hierarchy during modifications
2. The skip-planning path (projects ≤8 files) sends ALL files as primary with **no token trimming** — wasting tokens and confusing the AI
3. `TOKEN_BUDGET = 4000` is static — too tight for large projects, wasteful for small ones
4. `MAX_OUTPUT_TOKENS_MODIFICATION = 8192` truncates multi-file edits, triggering retries that multiply total token spend
5. 4 retry attempts (2 doing identical `replace_file`) waste tokens on failure paths

## Architecture

```
  User Prompt
       │
       ▼
  buildProjectMap(projectState)              ← NEW (~5ms, ~300 tokens)
    ├── extractRouteTree(App.tsx)
    ├── extractTypeSummary(types/index.ts)
    └── extractComponentIndex(files)
       │
       ▼
  shouldSkipPlanningHeuristic()
       │
       ├── YES (≤8 files)
       │     ▼
       │   buildSlicesFromFiles()
       │     ▼
       │   trimToFit(dynamicBudget)           ← FIX: now applied
       │
       └── NO
             ▼
           FilePlanner.planWithCategory()
             ▼
           trimToFit(dynamicBudget)           ← dynamic, not static 4000
       │
       ▼
  buildModificationPrompt()
    ├── Project Map (always)                  ← NEW
    ├── Primary files (full content)
    └── Context files (outlines)
       │
       ▼
  callModificationAI(maxOutputTokens=16384)   ← bumped from 8192
    ├── Attempt 1: full generation
    ├── Attempt 2: focused retry
    └── Attempt 3: replace_file               ← reduced from 4
```

## Key Decisions

- **#1A:** Dynamic budget computed inline at call sites — no constructor change to `TokenBudgetManager`
- **#2A:** Project Map NOT included in retry prompts — retries focus on edit matching, saves ~300 tokens per retry
- **#3B:** `extractRouteTree()` parses both JSX `<Route>` elements AND `createBrowserRouter` object syntax

---

## Phase 1: Project Map (new module)

> Gives the AI structural awareness of routes, types, and components for every modification.

- [x] **Task 1.1** — Create `backend/lib/analysis/project-map.ts`
  - `buildProjectMap(projectState): string` — top-level function, caps output at ~1200 chars
  - `extractRouteTree(appTsxContent)` — parses JSX `<Route path="..." element={<Component/>}/>` AND `createBrowserRouter([{ path, element }])`, handles nested routes + dynamic params (`:id`)
  - `extractTypeSummary(typesContent)` — extracts interface/type names + key fields from `types/index.ts`; omit section if no types file
  - `extractComponentIndex(projectState)` — lists components with directory category (`ui/`, `layout/`, `features/`)
  - Output format:
    ```
    === PROJECT MAP ===
    Routes: / → Dashboard, /settings → Settings, /tasks/:id → TaskDetail
    Types: Task { id, title, status }, User { id, name }
    Components: Dashboard (features/), Sidebar (layout/), Button (ui/)
    ```

- [x] **Task 1.2** — Create `backend/lib/analysis/project-map.test.ts`
  - Multi-page project → correct route tree (JSX format)
  - `createBrowserRouter` syntax → correct route tree
  - No App.tsx → graceful omit of Routes line
  - Dynamic routes (`:id`) → shown in output
  - No types file → omit Types line
  - Output truncated when over 1200 chars

---

## Phase 2: Token Budget Fixes

> Ensures all code paths respect an appropriate token budget based on project size.

- [x] **Task 2.1** — Add `getTokenBudget()` to `backend/lib/constants.ts`
  ```typescript
  export function getTokenBudget(fileCount: number): number {
    if (fileCount <= 5) return 3000;
    if (fileCount <= 12) return 6000;
    if (fileCount <= 25) return 8000;
    return 10000;
  }
  ```
  Keep `TOKEN_BUDGET = 4000` as static fallback (do not remove).

- [x] **Task 2.2** — Bump `MAX_OUTPUT_TOKENS_MODIFICATION` in `backend/lib/constants.ts`
  - Change: `8192` → `16384`

- [x] **Task 2.3** — Fix skip-planning path in `backend/lib/diff/modification-engine.ts`
  - In `selectCodeSlices()`, after `buildSlicesFromFiles()`, add `trimToFit` call:
    ```typescript
    slices = buildSlicesFromFiles(projectState);
    const fileCount = Object.keys(projectState.files).length;
    const budgetManager = new TokenBudgetManager(getTokenBudget(fileCount));
    slices = budgetManager.trimToFit(slices, {});  // empty ChunkIndex — createSimpleOutline() handles it
    ```
  - Import `TokenBudgetManager` from `../analysis/file-planner/token-budget`
  - Import `getTokenBudget` from `../constants`

- [x] **Task 2.4** — Apply dynamic budget in `backend/lib/analysis/file-planner/file-planner.ts`
  - In `planWithCategory()`, replace static budget with dynamic:
    ```typescript
    const fileCount = Object.keys(projectState.files).length;
    const budget = getTokenBudget(fileCount);
    const budgetManager = new TokenBudgetManager(budget);
    ```
  - Import `getTokenBudget` from `../../constants`

---

## Phase 3: Retry Reduction

> Attempts 3 and 4 both use `replace_file` — identical strategy. Remove the duplicate.

- [x] **Task 3.1** — Change `MAX_ATTEMPTS` in `backend/lib/diff/modification-generator.ts`
  - Line 35: `const MAX_ATTEMPTS = 4;` → `const MAX_ATTEMPTS = 3;`

---

## Phase 4: Inject Project Map into Prompts

> Wire the Project Map into the first-attempt modification prompt.

- [x] **Task 4.1** — Update `backend/lib/diff/prompt-builder.ts`
  - Rename `_projectState` → `projectState` in `buildModificationPrompt()` signature
  - Import `buildProjectMap` from `../analysis/project-map`
  - Inject before user request:
    ```typescript
    const projectMap = buildProjectMap(projectState);
    if (projectMap) {
      prompt += `${projectMap}\n\n`;
    }
    prompt += `User Request: ${userPrompt}\n\n`;
    ```
  - **Do NOT** inject into `buildFailedEditRetryPrompt()` or `buildReplaceFileRetryPrompt()` (decision #2A)

---

## Phase 5: Generation Prompt Improvements

> Improve guidance for multi-page generation so future projects are structured for easy modification.

- [x] **Task 5.1** — Update `backend/lib/core/prompts/generation-prompt.ts`
  - In `getFileRequirements('complex')`, add:
    - Each page component should manage its own state or use a shared context — don't prop-drill across pages
    - Keep page components thin (delegate to feature components) so modifications can target individual features
    - Add barrel exports (`index.ts`) per directory for cleaner imports

---

## Phase 6: Test Updates

> Update existing tests to match the new behavior.

- [x] **Task 6.1** — Update `backend/lib/diff/__tests__/modification-generator.test.ts`
  - Line 245: `'Failed after 4 attempts'` → `'Failed after 3 attempts'`
  - Line 29: Check if `getMaxOutputTokens` mock returning `8192` needs updating

- [x] **Task 6.2** — Update `backend/lib/__tests__/constants.test.ts`
  - Add tests for `getTokenBudget()`:
    - `getTokenBudget(3)` → `3000`
    - `getTokenBudget(8)` → `6000`
    - `getTokenBudget(15)` → `8000`
    - `getTokenBudget(30)` → `10000`

---

## Phase 7: Verification

- [x] **Task 7.1** — Run backend tests: `npm test --workspace=@ai-app-builder/backend`
- [x] **Task 7.2** — Run full build: `npm run build`
- [ ] **Task 7.3** — Manual smoke test: generate "build a task manager with dashboard, settings, and profile pages", then modify "add a notifications page" — verify Project Map appears in logs and AI produces correct route + import

---

## NOT in scope

- Streaming modifications — needs frontend protocol changes
- Route-aware auto-repair — Project Map could be used in repair flow, deferred
- Generation prompt Project Map — could include map in initial generation, deferred
- AI planning prompt improvements — FilePlanner's system prompt could reference Project Map, deferred
- Next.js file-based routing detection — only React Router for now

## What already exists (reused)

| Sub-problem | Existing code | Reused? |
|-------------|--------------|---------|
| Token trimming | `TokenBudgetManager.trimToFit()` in `token-budget.ts` | Yes — new call site on skip-planning path |
| Outline generation | `createSimpleOutline()` in `token-budget.ts` | Yes — fallback when no ChunkIndex |
| File type detection | `metadata-generator.ts` | Yes — component index reuses file type heuristics |
| Prompt assembly | `buildModificationPrompt()` | Yes — extended with Project Map |
| Dependency graph | `dependency-graph.ts` | No — Project Map is simpler (no graph traversal needed) |
