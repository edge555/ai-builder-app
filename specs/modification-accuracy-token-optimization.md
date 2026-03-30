# Modification Accuracy & Token Optimization

**Status:** ENG CLEARED — ready to implement
**Reviewed:** 2026-03-29 via `/plan-eng-review` + outside voice

## Problem

The modification pipeline fails ~50% of the time, even for simple prompts. Root causes:

1. **Too many AI calls** (4-6 per modification): FilePlanner, Intent, Planning, Execution, Review, + repairs
2. **Full file contents sent and returned** — a 1-line change sends/receives entire 200-line files
3. **Review stage wastes 32k output tokens** re-reading all merged files for marginal value
4. **Search/replace often fails** — AI writes imprecise search strings without line anchoring
5. **Intent + Planning run unconditionally** — even for trivial single-file edits

**Goal:** >80% success rate (up from ~50%), 1-2 AI calls for simple mods, 50%+ token reduction.

## Implementation Order

```
Phase 2 (prompts + replace_file bias + auto-fallback)   ← SHIP FIRST
    ↓
Phase 1 (review removal — safe after accuracy confirmed)
    ↓
Phase 3+5 (conditional stages — optimization)
    ↓
Phase 4 (context optimization — polish)
```

---

## Phase 2: Improve Search/Replace Reliability

> Ship this first. Accuracy improvements before removing safety nets.

### 2A — Add line numbers to file content sent to AI

- [x] **`backend/lib/diff/prompt-builder.ts`** — Add `addLineNumbers(content: string): string` utility function
- [x] **`backend/lib/diff/prompt-builder.ts`** — Apply `addLineNumbers` in `buildModificationPrompt` for primary files
- [x] **`backend/lib/diff/prompt-builder.ts`** — Apply `addLineNumbers` in `buildFailedEditRetryPrompt` for current file content
- [x] **`backend/lib/core/pipeline-orchestrator.ts`** — In `buildModificationUserPrompt`: prepend line numbers to primary file content
- [x] **`backend/lib/core/pipeline-orchestrator.ts`** — In `buildFocusedPrompt` (ordered pipeline): same line numbering for target files
  - Context files remain as outlines — no line numbers needed

**Line number format:**
```
--- src/Button.tsx ---
1: import React from 'react';
2: import './Button.css';
...
```

### 2B — Rewrite search/replace prompts + replace_file bias

- [x] **`backend/lib/core/prompts/shared-prompt-fragments.ts`** — Replace `SEARCH_REPLACE_GUIDANCE` with:
  - Key rule: "For files under 200 lines, ALWAYS use `replace_file` with complete file content. For files over 200 lines, use `modify` with search/replace."
  - "Copy search strings EXACTLY from the file content shown above (including indentation)"
  - "Each search block MUST contain >= 3 lines for unique anchoring"
  - "Edits are applied sequentially — after edit 1, edit 2 searches in MODIFIED content"
  - Concrete JSON example of both `replace_file` and `modify` operations
  - "When in doubt, use `replace_file` — a correct `replace_file` is always better than a failed `modify`"

- [x] **`backend/lib/core/prompts/unified-prompt-provider.ts`** — In `getExecutionModificationSystemPrompt`:
  - Move OUTPUT FORMAT section to the top (most important instruction first)
  - Add the 200-line threshold decision rule prominently
  - Add instruction: "Line numbers are shown in the file content for reference."

### 2C — Automatic replace_file fallback when search/replace fails

- [x] **`backend/lib/diff/modification-engine.ts`** — In `resolveModifications`: after `applyFileEdits` returns with failures, retry failed files with a replace_file prompt:
  1. Build focused retry prompt: "The search/replace for {file} failed. Return the complete file using replace_file."
  2. Make ONE AI call with current file content + failed edits + user prompt
  3. Apply the `replace_file` result
  4. Only record as failed if the retry also fails
- [x] **`backend/lib/diff/file-edit-applicator.ts`** — Support the replace_file fallback flow (no changes needed — already supports replace_file; fallback logic added in modification-engine.ts)

> Reuse existing `buildReplaceFileRetryPrompt` in `prompt-builder.ts` for the retry prompt.

### Phase 2 Tests

- [x] **`prompt-builder.test.ts`** — `addLineNumbers`: multi-line content, empty string, single line
- [x] **`prompt-builder.test.ts`** — `buildModificationPrompt`: assert line numbers present in primary files
- [x] **`prompt-builder.test.ts`** — `buildFailedEditRetryPrompt`: assert line numbers in current file content
- [x] **`modification-engine-routing.test.ts`** — replace_file fallback triggers when search/replace fails
- [x] **`modification-engine-routing.test.ts`** — replace_file fallback succeeds → file updated
- [x] **`modification-engine-routing.test.ts`** — replace_file fallback fails → recorded as failure

---

## Phase 1: Remove the Review Stage

> Only ship after Phase 2 confirms accuracy improvement. Review is redundant with replace_file fallback + DiagnosticRepairEngine.

The review stage sends up to 128k chars of merged files and uses 32k output tokens for marginal value.

### pipeline-orchestrator.ts

- [x] Remove `reviewProvider` from constructor (4 providers → 3)
- [x] In `runModificationPipeline`: delete Stage 4 (review). Set `finalFiles` directly from `applyModificationsToFiles(currentFiles, executorContent)`
- [x] In `runOrderedModificationPipeline`: same removal of review
- [x] Delete methods: `runReviewStage`, `mergeReviewCorrections`, `buildReviewUserPrompt`
- [x] Remove `'review'` from `PipelineStage` type
- [x] Remove `reviewOutput` from `PipelineResult` interface (keep `finalFiles`)
- [x] Remove `REVIEW_JSON_SCHEMA` constant and `ReviewOutputSchema` import

### pipeline-factory.ts

- [x] In `createPipelineOrchestrator`: remove `createAIProvider('review')` — only create intent, planning, execution providers
- [x] Update constructor call to match new 3-provider signature
- [x] Keep `createGenerationPipeline` **unchanged** — its plan review (4k tokens, architecture review) is a different purpose

### prompt-provider.ts

- [x] Remove `getReviewSystemPrompt()` from `IPromptProvider` interface
- [x] Remove `review` from `tokenBudgets` type

### unified-prompt-provider.ts

- [x] Delete `getReviewSystemPrompt` method
- [x] Remove `review` from `API_TOKEN_BUDGETS`

### constants.ts

- [x] Remove `MAX_OUTPUT_TOKENS_REVIEW`
- [x] Remove `MODAL_MAX_OUTPUT_TOKENS_REVIEW`
- [x] Remove `MAX_REVIEW_CONTENT_CHARS`

### modification-engine.ts

- [x] Remove `'reviewing'` from `ModificationPhase` type
- [x] Remove review-related progress callback mapping

### Phase 1 Tests

**Regressions fixed:**
- [x] `pipeline-orchestrator.test.ts` — stage count assertions updated to 3 (intent, planning, execution)
- [x] `modification-engine.ts` — `reviewOutput` field removed from `PipelineResult`

**Tests deleted:**
- [x] `pipeline-orchestrator.test.ts` — review stage graceful degradation section removed
- [x] `pipeline-orchestrator.test.ts` — `mergeReviewCorrections` describe block removed

**New tests added:**
- [x] **`pipeline-orchestrator.test.ts`** — Pipeline runs 3 stages in order (not 4)
- [x] **`pipeline-orchestrator.test.ts`** — `finalFiles` defined and non-empty directly from execution

---

## Phase 3+5: Make Intent + Planning Conditional

> For simple modifications, intent classification and planning are unnecessary overhead.

### modification-engine.ts

- [x] Replace `shouldSkipPlanningHeuristic` with `classifyModificationComplexity(prompt, projectState, slices)` returning `{ skipIntent: boolean, skipPlanning: boolean }`:
  - **Skip both** when: <=2 primary files selected by FilePlanner
  - **Skip both** when: `errorContext` is present (repair mode)
  - **Run both** when: >2 primary files AND >8 project files
  - **Skip both** when: >2 primary files AND <=8 project files (small project)

- [x] For small projects (<=8 files), skip the AI FilePlanner entirely — use heuristic file selection:
  - Match prompt keywords against file names and exported symbol names
  - All matching files → primary; rest → context
  - Fallback: all files primary if no keyword matches

### pipeline-orchestrator.ts

- [x] Add `skipIntent` and `skipPlanning` options to `runModificationPipeline`
- [x] When `skipIntent=true`: skip intent stage, pass `null` for `intentOutput`
- [x] When `skipPlanning=true`: skip planning stage, pass `null` for `planOutput`
  - The execution prompt already handles null intent/plan gracefully

**AI call totals after this phase:**

| Path | Conditions | AI calls |
|------|-----------|---------|
| Fast path | <=2 primary files | 1 (execution only) + 0-1 fallback + 0-2 repair = **1-4** |
| Standard path | >2 primary files | 1 FilePlanner + 1-2 intent/planning + 1 execution + 0-1 fallback + 0-2 repair = **2-7** |

### Phase 3+5 Tests

- [x] **`modification-engine-complexity.test.ts`** — `classifyModificationComplexity`: <=2 primary files → skip both
- [x] **`modification-engine-complexity.test.ts`** — `classifyModificationComplexity`: `errorContext` present → skip both
- [x] **`modification-engine-complexity.test.ts`** — `classifyModificationComplexity`: >2 primary + >8 files → run both
- [x] **`modification-engine-complexity.test.ts`** — `classifyModificationComplexity`: >2 primary + <=8 files → skip both
- [x] **`modification-engine-complexity.test.ts`** — `classifyModificationComplexity`: 0 primary files edge case
- [x] **`pipeline-orchestrator.test.ts`** — `skipIntent=true`: intent provider never called, `intentOutput` is null
- [x] **`pipeline-orchestrator.test.ts`** — `skipPlanning=true`: planning provider never called, `planOutput` is null
- [x] **`pipeline-orchestrator.test.ts`** — Both skipped: only execution called

---

## Phase 4: Optimize Context Assembly

> Independent — can run in parallel with Lane A.

- [x] **`backend/lib/diff/prompt-builder.ts`** — Ensure context files always use outlines (signatures + exports only), never full content
- [x] **`backend/lib/diff/prompt-builder.ts`** — Always include the project file tree via `buildProjectMap`
- [x] **`backend/lib/constants.ts`** — Add `MAX_CONTEXT_SLICES_MODIFICATION = 8` (separate from generation's 15)

---

## Verification

Run after each phase:

```bash
npm test --workspace=@ai-app-builder/backend
```

Manual test prompts:
- **Simple:** "Change the header color to blue" → expect 1 AI call, single file
- **Medium:** "Add a dark mode toggle" → expect 1-2 AI calls, 2-3 files
- **Complex:** "Refactor the navigation to use a sidebar layout" → expect 2-4 AI calls, 5+ files

Target metrics:
- Modification success rate: **>80%** (up from ~50%)
- AI calls per simple mod: **1-2**
- Total token reduction: **50%+**

---

## Not In Scope

- DRY consolidation of `buildModificationUserPrompt` (orchestrator) and `buildModificationPrompt` (prompt-builder) — deferred to Unified Pipeline Architecture TODO
- Lazy provider creation in pipeline-factory — premature optimization
- `line_hint` schema field — dropped in favor of replace_file bias (simpler, more reliable)
- Modification eval suite — captured in TODOS.md, build after this ships
- Generation pipeline changes — its plan review stage is kept, not touched

## Known Tradeoffs

| Risk | Mitigation |
|------|-----------|
| No review stage + AI makes logical error → silent wrong change | Phase 2 ships first; preview panel shows result; undo/redo available |
| Skip intent+planning misclassifies complex change as simple | Execution handles null intent/plan gracefully; quality may degrade but won't crash |
| Heuristic file selection picks wrong files | Falls back to all-files-primary; degraded but functional |
| replace_file fallback → AI truncates output on token limit | Build validator catches it; repair triggers |
