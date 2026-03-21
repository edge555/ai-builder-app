# Code Modification & Repair Pipeline

## Context

The AI app builder's modification and repair system is unreliable. Common failures:
- Search/replace mismatches (AI-generated search strings don't match actual code)
- Missing imports/exports after multi-file changes
- Over-modification (AI rewrites entire files when only a few lines should change)
- Auto-repair exhausts 3 identical attempts without fixing the issue
- No deterministic fixes — every error triggers an expensive AI call

**Goal**: Reliable code modification and repair without blowing up token costs.

**Principles**:
- Deterministic fixes first, AI only when necessary
- Batch errors into single AI calls, never per-file per-attempt
- No backward compatibility concerns — replace, don't wrap
- No fallback-retry patterns that double execution cost

---

## Key Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | DiagnosticRepairEngine **replaces** build-fixer.ts | Avoids 3 competing repair systems |
| 2 | No fallback retry — route correctly upfront, repair if anything fails | Fallback retry doubles execution token cost |
| 3 | Root cause: **deterministic dep-graph first, AI fallback** only when ambiguous | Saves tokens on most cascading errors |
| 4 | Execution routing via **file count heuristic** (`<=3` single-shot, `>3` ordered) | Free, deterministic. AI `changeScope` is unreliable and costs prompt tokens |
| 5 | Deterministic fixes in **standalone module** (`deterministic-fixes.ts`) | DRY — used by interim build-fixer and DiagnosticRepairEngine |
| 6 | Package table: **~20 curated packages**, `"latest"` for unknowns | Low maintenance, Sandpack resolves `"latest"` fine |
| 7 | Error taxonomy: **6 categories** matching what's actually detectable | Removed TYPE_MISMATCH, CSS_MISSING, OVER_MODIFICATION |
| 8 | Diff size guard: **auto-convert** `modify -> replace_file` at >90%, **no retry** | Retry burns an AI call. Auto-conversion costs zero tokens |
| 9 | Repair escalation: **batch ALL errors into ONE AI call** per level | 3 broken files x 4 attempts = 12 calls -> batched = 2 calls max |
| 10 | Ordered execution context: **outlines only** via existing `getFileOutline()` | Prevents token budget blowout on deep dependency chains |

---

## Architecture

```
USER PROMPT
    |
    v
ModificationEngine.modifyProject()
    |
    +-- 1. FilePlanner -> select code slices + file count
    |
    +-- 2. Route execution (file count heuristic, no AI):
    |     <=3 files -> single-shot | >3 files -> ordered [Phase 3]
    |
    +-- 3. PipelineOrchestrator
    |     +-- Intent (existing, unchanged)
    |     +-- Planning
    |     +-- Execution (single-shot OR ordered per-file)
    |     +-- Review
    |
    +-- 4. resolveModifications() -> applyFileEdits()
    |     +-- DiffSizeGuard                              [Phase 1]
    |           >90% changed + op=modify -> auto-convert
    |           to replace_file (zero cost, no retry)
    |
    +-- 5. validateModifiedFiles() + validateCrossFileReferences()  [Phase 1]
    |
    +-- 6. DiagnosticRepairEngine (replaces build-fixer.ts)  [Phase 2]
          |  Batches ALL errors into single AI calls per level:
          |
          +-- Step 1: Deterministic fixes for ALL errors (0 AI calls)
          +-- Step 2: Re-validate -> if clean, done
          +-- Step 3: ONE targeted AI call (all broken files + errors, temp 0.2)
          +-- Step 4: Re-validate -> if clean, done
          +-- Step 5: ONE broad AI call (+ related files, temp 0.4)
          +-- Step 6: Re-validate -> if clean, done
          +-- Step 7: Rollback broken files to checkpoint, partial success

No fallback retry. If execution fails validation, go straight to repair.
```

**Token cost comparison** (worst case: 3 files modified, 2 have build errors):
```
CURRENT:  1 execution + 2 build-fix AI + 3 auto-repair = ~48K output tokens
NEW:      1 execution + 0 deterministic + 1 targeted AI + 1 broad AI = ~18K output tokens
```

---

## Phase 1: Deterministic Fixes + Diff Guard

**Goal**: Fix 60-70% of errors without any AI calls.

### Task 1.1: Diff Size Guard
- [x] Create `backend/lib/diff/diff-size-guard.ts`
- [x] Implement `evaluateDiffSize(original, modified, operation)` returning `DiffSizeResult`
- [x] Logic: `create`/`replace_file`/`delete` -> always `ok`
- [x] Logic: `modify` with `changeRatio > 0.6` -> `suspicious` (log warning, continue)
- [x] Logic: `modify` with `changeRatio > 0.9` -> `converted` (auto-convert to `replace_file`, zero cost, no retry)
- [x] Integrate into `ModificationEngine` after `resolveModifications()`, before validation
- [x] Write tests: `backend/lib/diff/__tests__/diff-size-guard.test.ts`
  - [x] Ratios at 0.5, 0.7, 0.95
  - [x] Auto-converts modify -> replace_file at 0.95

### Task 1.2: Deterministic Fix Module
- [x] Create `backend/lib/diff/deterministic-fixes.ts`
- [x] Implement `tryDeterministicFixes(errors, files)` -> `{ fixed, remaining, fileChanges }`
- [x] Strategy: `missing_dependency` -> add to package.json from `KNOWN_PACKAGES` in `constants.ts` (~20 packages), `"latest"` for unknowns
- [x] Strategy: `broken_import` (relative) -> fuzzy-match paths, Levenshtein <= 2, skip if tied
- [x] Strategy: `broken_import` (missing ext) -> try `.ts`, `.tsx`, `.js`, `.jsx`
- [x] Strategy: `import_export_mismatch` -> flip default/named if unambiguous
- [x] Strategy: `syntax_error` (unclosed at EOF) -> append closer, skip if inside string/comment
- [x] Integrate into `build-fixer.ts` `validateAndFixBuild()` before the AI while-loop
- [x] Write tests: `backend/lib/diff/__tests__/deterministic-fixes.test.ts`
  - [x] Happy path for each of 5 strategies
  - [x] Edge: tied fuzzy match -> skip
  - [x] Edge: ambiguous export -> skip
  - [x] Edge: bracket inside string -> skip
  - [x] Edge: unknown package -> "latest"
  - [x] Edge: malformed package.json -> skip

**Curated package table** (~20 entries, single source of truth in `backend/lib/constants.ts`):
```
react, react-dom, react-router-dom, lucide-react, zod, zustand,
framer-motion, @tanstack/react-query, date-fns, clsx, tailwindcss,
axios, recharts, react-hook-form, @headlessui/react, @radix-ui/react-*,
react-hot-toast, uuid, lodash, react-icons
```

### Task 1.3: Cross-File Validation
- [x] Add `validateCrossFileReferences(files)` to `backend/lib/core/build-validator.ts`
- [x] Check: named import `{ Foo }` from `./bar` -> verify `bar` exports `Foo`
- [x] Check: new package import -> verify in `package.json`
- [x] Check: removed export -> verify no other file imports it
- [x] Handle barrel files (`export *`), re-exports, type-only imports without false positives
- [x] Implement as a method on `BuildValidator` (keeps `extractImports()`, `hasDefaultExport()` private)
- [x] Integrate at `ModificationEngine.modifyProject()` step 6, after file merge
- [x] Write tests in `backend/lib/core/__tests__/build-validator.test.ts`:
  - [x] Missing named export -> error
  - [x] Barrel file (no false positive)
  - [x] Re-export (no false positive)
  - [x] Type-only import (no false positive)

### Task 1.4: Shared Type Updates
- [x] Add `partialSuccess?: boolean` to `ModificationResult` in `shared/src/types/`
- [x] Add `rolledBackFiles?: string[]` to `ModificationResult`
- [x] Build shared package to verify types compile

### Phase 1 Files Summary
| File | Action |
|------|--------|
| `backend/lib/diff/diff-size-guard.ts` | **new** |
| `backend/lib/diff/deterministic-fixes.ts` | **new** |
| `backend/lib/diff/build-fixer.ts` | integrate deterministic fixes |
| `backend/lib/diff/modification-engine.ts` | integrate diff size guard |
| `backend/lib/core/build-validator.ts` | add `validateCrossFileReferences()` |
| `shared/src/types/` | extend `ModificationResult` |
| `backend/lib/diff/__tests__/diff-size-guard.test.ts` | **new** |
| `backend/lib/diff/__tests__/deterministic-fixes.test.ts` | **new** |
| `backend/lib/constants.ts` | add `KNOWN_PACKAGES` map |

### Task 1.5: Integration Test for Post-Execution Flow
- [ ] Write `backend/lib/diff/__tests__/modification-engine.test.ts`
  - [ ] Mock pipeline, verify full post-execution wiring: diff guard → cross-file validation → repair engine
  - [ ] Verify auto-converted files flow correctly through validation
  - [ ] Verify cross-file errors route to repair engine

---

## Phase 2: Diagnostic Repair Engine

**Goal**: Replace build-fixer.ts with smarter, cheaper repair. Batch errors into single AI calls.

### Task 2.1: Error Classifier
- [x] Create `backend/lib/diff/diagnostic-repair-engine.ts`
- [x] Define 6-category taxonomy:
  ```
  MISSING_DEPENDENCY  -> deterministic fix available
  BROKEN_IMPORT       -> deterministic fix available
  EXPORT_MISMATCH     -> deterministic fix available
  SYNTAX_ERROR        -> deterministic fix (maybe)
  RUNTIME             -> needs AI
  UNKNOWN             -> needs AI
  ```
- [x] Implement `classifyError(error)` mapping `BuildError.type` -> `RepairCategory`
- [x] Write tests: each BuildError type maps to correct category

### Task 2.2: Batched Repair Engine
- [x] Implement `DiagnosticRepairEngine.repair(request)` with this flow:
  ```
  Step 1: Classify ALL errors
  Step 2: Run deterministic fixes for ALL fixable errors (0 AI calls)
  Step 3: Re-validate -> if clean, return success
  Step 4: ONE targeted AI call for ALL remaining errors
          Context: broken files only + error messages
          Temperature: 0.2
  Step 5: Re-validate -> if clean, return success
  Step 6: ONE broad AI call with more context
          Context: broken files + up to 3 related files per error (dep graph)
          Temperature: 0.4, include failure history
  Step 7: Re-validate -> if clean, return success
  Step 8: Rollback still-broken files to checkpoint, return partial success
  ```
- [x] Write full escalation integration test:
  - [x] Mock AI to fail at targeted + broad levels
  - [x] Verify batched error context sent correctly
  - [x] Verify temperature changes per level
  - [x] Verify rollback fires and produces correct partial success

### Task 2.3: Root Cause Analyzer (hybrid)
- [x] Implement deterministic root cause: trace dep graph backward from error file
- [x] If exactly 1 modified ancestor -> that's the root cause (no AI)
- [x] If ambiguous (0 or multiple ancestors) -> ONE fast AI call (~512 output tokens)
- [x] If AI returns invalid JSON -> skip, proceed as UNKNOWN
- [x] Write tests:
  - [x] Single ancestor -> deterministic result
  - [x] Multiple ancestors -> AI call made
  - [x] Invalid JSON -> graceful fallback

### Task 2.4: Checkpoint Manager
- [x] Create `backend/lib/diff/checkpoint-manager.ts` (~30 lines)
- [x] `capture(files, filePaths)` -> store pre-modification content
- [x] `rollback(filePath)` -> return original content or null
- [x] `rollbackAll()` -> return all captured content
- [x] Integrate: create checkpoint in `ModificationEngine` before pipeline execution
- [x] Write tests: `backend/lib/diff/__tests__/checkpoint-manager.test.ts`
  - [x] Capture + rollback single file
  - [x] rollbackAll produces correct state
  - [x] Rollback uncaptured file -> null

### Task 2.5: Wire Into ModificationEngine
- [x] Replace `validateAndFixBuild()` call with `DiagnosticRepairEngine.repair()`
- [x] Delete `backend/lib/diff/build-fixer.ts`
- [x] Update all imports referencing build-fixer
- [x] Migrate or replace existing build-fixer tests

### Task 2.6: Frontend Updates
- [x] Update `AutoRepairContext.tsx`: `maxRepairAttempts` 3 -> 5
- [x] Send richer error context (5 lines around error location)
- [x] Update `GenerationContext.tsx`: pass attempt number to backend
- [x] Handle `partialSuccess` result ("X files modified, Y rolled back")

### Phase 2 Files Summary
| File | Action |
|------|--------|
| `backend/lib/diff/diagnostic-repair-engine.ts` | **new** |
| `backend/lib/diff/checkpoint-manager.ts` | **new** |
| `backend/lib/diff/build-fixer.ts` | **delete** |
| `backend/lib/diff/modification-engine.ts` | replace build-fixer integration |
| `frontend/src/context/AutoRepairContext.tsx` | enhance |
| `frontend/src/context/GenerationContext.tsx` | enhance |
| `backend/lib/diff/__tests__/diagnostic-repair-engine.test.ts` | **new** |
| `backend/lib/diff/__tests__/checkpoint-manager.test.ts` | **new** |

---

## Phase 3: Dependency-Aware Execution

**Goal**: Execute multi-file modifications in dependency order with per-file validation.

### Task 3.1: Extend Dependency Graph
- [x] Add `getTopologicalOrder(files)` to `backend/lib/analysis/dependency-graph.ts`
- [x] Add `getTransitivelyAffected(files)` -> `Set<string>`
- [x] Handle cycles: break by removing back-edges, log warning
- [x] Write tests in `backend/lib/analysis/__tests__/dependency-graph.test.ts`:
  - [x] Linear chain A->B->C
  - [x] Diamond dependency
  - [x] Cycle -> breaks with warning

### Task 3.2: Impact Analyzer
- [x] Create `backend/lib/analysis/impact-analyzer.ts`
- [x] `analyze(filesToModify, projectState, fileIndex, depGraph)` -> `ImpactReport`
- [x] Output: `modificationOrder` (topo sorted), `tiers` (grouped by depth), `affectedButUnmodified`
- [x] Write tests: `backend/lib/analysis/__tests__/impact-analyzer.test.ts`

### Task 3.3: Ordered Execution Mode
- [x] Add `runOrderedModificationPipeline()` to `backend/lib/core/pipeline-orchestrator.ts`
- [x] Per-tier: build focused prompt (target file full + modified files as **outlines via `getFileOutline()`**) + user request
- [x] Parallelize within tiers via `Promise.all()`
- [x] Per-file validation after each edit, retry once on failure
- [x] Write integration test: modify type file + 2 consumers, verify context propagation

### Task 3.4: Execution Routing
- [x] Route in `ModificationEngine.modifyProject()`:
  ```
  filesToModify <= 3  -> single-shot (current)
  filesToModify > 3   -> ordered execution
  ```
- [x] No AI-based routing, no fallback retry
- [x] If execution fails validation -> DiagnosticRepairEngine
- [x] Write test: routing based on file count

### Phase 3 Files Summary
| File | Action |
|------|--------|
| `backend/lib/analysis/impact-analyzer.ts` | **new** |
| `backend/lib/analysis/dependency-graph.ts` | extend |
| `backend/lib/core/pipeline-orchestrator.ts` | add ordered mode |
| `backend/lib/diff/modification-engine.ts` | add routing |
| `backend/lib/analysis/__tests__/impact-analyzer.test.ts` | **new** |

---

## Failure Modes

| Failure | What Happens | Tested? |
|---------|-------------|---------|
| Diff guard auto-converts valid modify | Correctness preserved, diff is larger | Yes |
| Deterministic fix adds wrong version | Sandpack runtime error -> auto-repair | Indirect |
| Cross-file validation false positive (barrel) | Unnecessary repair loop | Yes (negative tests) |
| All repair levels fail | Rollback to checkpoint, partial success | Yes |
| Root cause AI returns invalid JSON | Skip, treat as UNKNOWN | Yes |
| Ordered execution: AI timeout on one file | Request timeout, skip file | Needs test |
| Checkpoint never captured (bug) | `rollback()` returns null, no crash | Yes |

---

## Deferred (TODOS.md)

- [ ] **AST-based syntax validation**: Use `acorn`/`@babel/parser` instead of regex bracket-balancing. File: `backend/lib/core/validators/syntax-validator.ts`
- [ ] **CSS consistency checking**: Validate CSS syntax, cross-reference `className` usage. File: `backend/lib/core/validators/css-validator.ts`
- [ ] **Incremental validation**: Only validate changed files + dependents. Depends on Phase 3 dep graph extensions

---

## Existing Code to Reuse

| What | Where | Used By |
|------|-------|---------|
| `extractImports()`, `hasDefaultExport()` | `backend/lib/core/build-validator.ts` | Cross-file validation (1.3) |
| `getFileOutline()` | `backend/lib/analysis/slice-selector.ts` | Ordered execution context (3.3) |
| `DependencyGraph.getDependents()` | `backend/lib/analysis/dependency-graph.ts` | Root cause analyzer (2.3), Impact analyzer (3.2) |
| `applyEdits()` | `backend/lib/diff/edit-applicator.ts` | Repair engine apply step |
| `BuildValidator.validate()` | `backend/lib/core/build-validator.ts` | All validation steps |
| `BuildValidator.formatErrorsForAI()` | `backend/lib/core/build-validator.ts` | AI repair prompts |
| ProjectState mock patterns | `backend/lib/diff/__tests__/build-fixer.test.ts` | All new test files |
