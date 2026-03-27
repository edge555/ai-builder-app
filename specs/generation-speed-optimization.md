# Generation Speed Optimization (~20-30% faster)

**Goal:** ~20% speedup on generation without breaking reliability.
**Scope:** Backend generation pipeline only. No modification pipeline, no frontend changes.

---

## Phase 1: Cache File Summaries ✅

**Files:** `backend/lib/core/batch-context-builder.ts`, `backend/lib/core/generation-pipeline.ts`
**Saves:** 1-3s on multi-phase projects

`buildPhaseContext()` re-summarizes previously generated files on every phase call. Scaffold files get parsed multiple times across phases.

- [x] Add optional `summaryCache: Map<string, FileSummary>` parameter to `buildPhaseContext()`
- [x] Check cache before calling `summarizeFile()`; store result after computing
- [x] In `executeMultiPhase()`, create the cache once at the top of the method and pass it through each batch iteration
- [x] Add test: call `buildPhaseContext` twice with same files; assert `summarizeFile` called once per unique path
- [x] Add test: no `summaryCache` param → existing behavior unchanged

---

## Phase 2: Skip Plan Review for Simple Projects ✅

**Files:** `backend/lib/core/generation-pipeline.ts` (lines 217-268)
**Saves:** 5-10s on projects with ≤10 files

Plan Review is a full AI call (4096 tokens) that rarely finds issues for simple projects.

- [x] Wrap Plan Review block in `if (architecturePlan.files.length > COMPLEXITY_GATE_FILE_THRESHOLD)`
- [x] Log that review was skipped (e.g. `'Skipping plan review for simple project'`)
- [x] Fire `onStageStart('review', 'Skipping plan review...')` AND `onStageComplete('review')` when skipping — both must fire, never `onStageComplete` without a matching `onStageStart`
- [x] Add test: plan with ≤10 files → assert `reviewProvider.generate` is NOT called
- [x] Add test: plan with >10 files → assert `reviewProvider.generate` IS called
- [x] Add test: both `onStageStart` and `onStageComplete` fire for 'review' even when skipped

---

## Phase 3: Sequential Intent → Immediate Planning Start ✅

**Files:** `backend/lib/core/generation-pipeline.ts` (lines 103-213)
**Saves:** 2-5s

Intent finishes in ~1-2s (512 token budget). Instead of doing all intent cleanup/callbacks before firing planning, start the planning AI call immediately after intent resolves.

**Ordering constraint:**
1. Intent resolves
2. Fire planning AI call immediately
3. Run `selectRecipe(intentOutput, ...)` and `promptProvider.setRecipe(recipe)` — synchronous, <1ms, completes long before planning finishes
4. Planning finishes → execution phases use the already-set recipe

- [x] After intent resolves, fire planning AI call before running recipe selection or callback cleanup
- [x] Run recipe selection synchronously (it's <1ms) while planning is in flight
- [x] Check abort signal between intent and planning — if `signal.aborted`, cancel before firing planning
- [x] Add test: after intent resolves, planning mock is called with the full intent output (not null)
- [x] Add test: abort signal fires after intent → planning is NOT called

---

## Phase 4: Remove Redundant Post-Pipeline Validation ✅

**Files:** `backend/lib/core/streaming-generator.ts` (lines 233-303)
**Saves:** 1-2s

PhaseExecutor already runs `buildValidator.validate()` per phase and retries on syntax errors. The post-pipeline `validationPipeline.validate()` — especially `validateSyntax()` (TypeScript parsing) — is redundant.

- [x] Remove the `validationPipeline.validate()` call at line 235 entirely
- [x] Remove the `validationResult.valid` check and the non-syntax-error hard-fail branch
- [x] Keep the file-dropping block (lines 248-270) but rewrite it to use `buildValidator.validate()` instead of ValidationPipeline — drop files that fail this check, emit warning for each
- [x] Add test: mock one file with a syntax error in a 3-file result; assert 2 files delivered, 1 dropped, `onWarning` fired
- [x] Add test: assert `validationPipeline.validate` is NOT called (spy asserting mock never invoked)

---

## Phase 5: True One-Shot Execution Path ✅

**Files:** `generation-pipeline.ts`, `phase-executor.ts`, `unified-prompt-provider.ts`, `schemas.ts`, `constants.ts`
**Saves:** 10-20s on ≤10 file projects

The one-shot branch (lines 299-310) currently calls the identical `executeMultiPhase()`. Simple projects make 2 sequential AI calls (scaffold → UI) unnecessarily. True one-shot uses 1 AI call.

### 5a: PhaseLayer type + token budget

- [x] Add `'oneshot'` to the `PhaseLayer` union type in `backend/lib/core/schemas.ts`
- [x] Add `oneshot: MAX_OUTPUT_TOKENS_GENERATION` to `tokenBudgets` in `UnifiedPromptProvider` (fixes undefined → NaN bug)
- [x] Add `getPhasePrompt('oneshot', ...)` case in `UnifiedPromptProvider` → maps to `getExecutionGenerationSystemPrompt()`

### 5b: PhaseDefinition expectedFiles override

- [x] Add `expectedFiles?: string[]` to `PhaseDefinition` interface in `phase-executor.ts`
- [x] In `executePhase()`, when `expectedFiles` is set, use it instead of `plan.files.filter(f => f.layer === layer)` for `allExpectedFiles` (fixes empty truncation detection for oneshot)

### 5c: One-shot continuation context fix

- [x] When `layer === 'oneshot'` and a continuation round fires, extend the continuation prompt to include already-generated file paths: `"These files were already generated: [list]. Generate ONLY the following missing files: [list]."`
- [x] This prevents broken imports in continuation-generated files

### 5d: executeOneShot() method

- [x] Add `executeOneShot()` private method to `GenerationPipeline`
- [x] Creates a single `PhaseDefinition` with `layer: 'oneshot'`, `expectedFiles: plan.files.map(f => f.path)`
- [x] Calls `phaseExecutor.executePhase()` once with an empty `PhaseContext` (no prior files)
- [x] Wire the complexity gate: `if (complexityRoute === 'one-shot') return this.executeOneShot(...)`

### 5e: Tests

- [x] Add test: plan with ≤10 files → `phaseExecutor.executePhase` called exactly once with `layer: 'oneshot'`
- [x] Add test: plan with >10 files → multi-phase path used (not oneshot)
- [x] Add test: `tokenBudgets.oneshot` returns `MAX_OUTPUT_TOKENS_GENERATION` (not undefined)
- [x] Add test: `expectedFiles` override used for `allExpectedFiles` when set in `PhaseDefinition`
- [x] Add test: oneshot continuation prompt includes already-generated file list

---

## Verification

After each phase, run:

```bash
npm run test --workspace=@ai-app-builder/backend
```

After all phases, manual E2E — generate 3 projects and compare `durationMs` in logs:

| Project | Expected path | Expected saving |
|---------|--------------|-----------------|
| "Build a todo app" (~5 files) | One-shot, no plan review | Phases 2+3+5 |
| "Build a recipe app with search" (~10 files) | One-shot boundary | All phases |
| "Build a project management dashboard" (~15+ files) | Multi-phase, with plan review | Phases 1+3+4 |

**Regression check:** Generated projects must render in Sandpack preview without auto-repair triggering.

---

## NOT in Scope

- Parallel Intent + Planning simultaneously (dropped: quality degrades without intent's complexity signal)
- Modifying the build-fix loop retry logic
- Reducing per-phase token budgets (quality risk)
- Modification pipeline changes (generation only)
- Unified GenerationPipeline + PipelineOrchestrator merge (existing TODOS.md P1 item)
