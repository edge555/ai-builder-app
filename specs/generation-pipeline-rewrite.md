# Generation Pipeline Rewrite: Multi-Phase Architecture

> **Status**: Planning complete, ready for implementation
> **Date**: 2026-03-20
> **Eng Review**: Passed (12 decisions resolved, 0 critical gaps)

---

## Context & Problem

The current generation system generates ALL project files in a single AI call (32K token budget). This works for trivial 5-8 file projects but fails for complex 15-25 file apps due to:

- **Token exhaustion**: Output truncated mid-file, JSON corrupted
- **Cross-file inconsistency**: Types don't match usage, imports reference non-existent exports
- **Cognitive overload**: AI simultaneously handles architecture, types, implementation, styling, routing
- **Silent failures**: Truncated JSON returns `[]` files, no recovery

**Goal**: Replace the single-shot execution with a multi-phase batched generation pipeline. Clean rewrite of the generation core for maximum reliability.

---

## Pipeline Architecture

```
User Prompt
    |
    v
[Phase 1: Intent]              -- keep existing, unchanged
    |
    v
[Phase 2: Architecture Plan]   -- MAJOR upgrade: contracts + batch plan
    |
    v
[Phase 2b: Plan Review]        -- NEW: AI validates plan consistency
    |
    v
[Complexity Gate]              -- <=10 files -> one-shot, >10 -> multi-phase
    |
    +-- ONE-SHOT PATH (<=10 files)           -- enhanced with plan contracts
    |   +-- [Execution] -> [Review] -> [BugFix]
    |
    +-- MULTI-PHASE PATH (>10 files)
        |
        +-- [Phase Merge]       -- skip layers with <=1 file
        |
        +-- [Scaffold]          -- types, package.json, CSS, entry points
        +-- [Logic]             -- hooks, contexts, utils (if >=2 files)
        +-- [UI]                -- components + CSS (split if >12 files)
        +-- [Integration]       -- pages, App.tsx, routing
        |
        +-- [Cross-File Validation] -- BuildValidator between + after phases
        +-- [Review & Fix]      -- enhanced with plan contracts
```

---

## Key Architectural Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Plan validation | AI reviews plan for consistency | Bad plan propagates through all phases; ~$0.02 + 5s is worth it |
| 2 | File summarizer | Reuse `ChunkIndexBuilder` with adapter | DRY — existing AST parsing already tested |
| 3 | Always multi-phase? | Complexity gate (<=10 one-shot, >10 multi-phase) | Simple projects don't need overhead |
| 4 | Orchestrator split | New `GenerationPipeline`; old keeps modification only | Clean boundary, no pass-through |
| 5 | Recipe system | Extend recipes with per-phase fragment lists | Preserves fullstack/SPA recipe pattern |
| 6 | Path conventions | Data-driven from plan | Works with all recipes, not just SPA |
| 7 | Retry strategy | Simple retry (2 attempts, no batch split) | Review stage is the safety net |
| 8 | Sparse phases | Merge phases with <=1 file into next | Saves API calls for sparse layers |
| 9 | Eval suite | Add 3 eval cases (simple/medium/complex) | Prompt changes are the riskiest part |
| 10 | Test migration | Migrate generation tests to new file | No dead test coverage |
| 11 | Latency | Accept (~53s vs ~25s for complex) | Streaming UX shows constant progress |
| 12 | Token overflow | Truncation detection + input budget check | Closes both critical silent-failure gaps |

---

## IMPLEMENTATION PHASES

---

### PHASE 1: Schemas & Constants

> Foundation data structures that everything else depends on.

- [x] **Task 1.1**: Add `ArchitecturePlanSchema` to `backend/lib/core/schemas.ts`
  - New Zod schema with: files (path, purpose, layer, exports, imports), typeContracts, cssVariables, stateShape
  - Layer enum: `'scaffold' | 'logic' | 'ui' | 'integration'`
  - Schema for typeContracts: `{ name: string, definition: string }` (full TypeScript interface text)
  - Schema for cssVariables: `{ name: string, value: string, purpose: string }`
  - Schema for stateShape: contexts (name, stateFields, actions) + hooks (name, signature, purpose)

- [x] **Task 1.2**: Add phase token budget constants to `backend/lib/constants.ts`
  - `MAX_OUTPUT_TOKENS_ARCHITECTURE_PLANNING = 8192`
  - `MAX_OUTPUT_TOKENS_PLAN_REVIEW = 4096`
  - `MAX_OUTPUT_TOKENS_SCAFFOLD = 6000`
  - `MAX_OUTPUT_TOKENS_LOGIC = 10000`
  - `MAX_OUTPUT_TOKENS_UI = 20000`
  - `MAX_OUTPUT_TOKENS_INTEGRATION = 8000`
  - `INPUT_TOKEN_SAFETY_THRESHOLD` (80% of model context window)
  - `MAX_PHASE_RETRIES = 2`
  - `MAX_CONTINUATION_ROUNDS = 2`
  - `UI_BATCH_SPLIT_THRESHOLD = 12`

- [x] **Task 1.3**: Extend `GenerationRecipe` in `backend/lib/core/recipes/recipe-types.ts`
  - Add optional `phaseFragments` field: `{ scaffold?: string[], logic?: string[], ui?: string[], integration?: string[] }`
  - Update `REACT_SPA` recipe with per-phase fragment assignments
  - Update `NEXTJS_PRISMA` recipe with per-phase fragment assignments
  - Update `NEXTJS_SUPABASE_AUTH` recipe with per-phase fragment assignments

- [x] **Task 1.4**: Write unit tests for new schemas
  - Valid plan objects parse correctly
  - Invalid plans (missing fields, wrong layer values) fail with clear errors
  - Edge cases: empty files array, no stateShape, no cssVariables

**Files touched**:
- `backend/lib/core/schemas.ts` (modify)
- `backend/lib/constants.ts` (modify)
- `backend/lib/core/recipes/recipe-types.ts` (modify)

---

### PHASE 2: Utilities (Batch Context Builder + File Summary Adapter)

> Pure functions for cross-phase context passing. No AI calls, easy to test.

- [x] **Task 2.1**: Create `backend/lib/core/batch-context-builder.ts`
  - `buildPhaseContext(phase, plan, generatedFiles, currentBatchFiles)` -> `PhaseContext`
  - Data-driven file lookup: find types/CSS files by plan layer assignments (not hardcoded paths)
  - `getDirectDeps(batchFiles, plan, generatedFiles)`: return full content of files the batch imports from
  - `extractCSSVariableNames(cssContent)`: regex extract `--var-name` from CSS content
  - `getContractsForBatch(batchFiles, plan)`: return typeContracts + stateShape relevant to batch
  - `PhaseContext` interface: typeDefinitions, directDependencies, fileSummaries, cssVariables, relevantContracts

- [x] **Task 2.2**: Create file summary adapter over `ChunkIndexBuilder`
  - Thin wrapper (~30 lines) in `batch-context-builder.ts` or separate small file
  - `summarizeFile(path, content)` -> `FileSummary { path, exports, imports, cssClasses }`
  - Reuse `ChunkIndexBuilder` from `backend/lib/analysis/file-planner/` for AST parsing
  - Add CSS class extraction for `.css` files (regex: `/\.([\w-]+)/g`)

- [x] **Task 2.3**: Write unit tests for batch context builder
  - Context built correctly for each phase type (logic, ui, integration)
  - Direct dependencies resolved from plan import graph
  - CSS variable extraction from real CSS content
  - File summaries via ChunkIndexBuilder adapter
  - Edge cases: empty generatedFiles, files not in plan, CSS file with no variables

**Files touched**:
- `backend/lib/core/batch-context-builder.ts` (create)
- Tests for above

---

### PHASE 3: Phase Prompts + Recipe Extension

> System prompts for each generation phase. The prompt engineering layer.

- [x] **Task 3.1**: Create `backend/lib/core/prompts/phase-prompts.ts`
  - `getScaffoldPrompt(plan, userPrompt)`: instruct AI to generate types EXACTLY as in typeContracts, CSS vars EXACTLY as in plan, package.json with all deps
  - `getLogicPrompt(plan, context, userPrompt)`: generate hooks/contexts matching plan's stateShape signatures
  - `getUIPrompt(plan, context, userPrompt, recipe)`: generate components + CSS, consult recipe phaseFragments
  - `getIntegrationPrompt(plan, context, userPrompt)`: wire pages + App.tsx + routing from plan
  - `getPlanReviewPrompt(plan)`: validate internal consistency (imports, type refs, layers)
  - Each prompt includes relevant shared fragments from `shared-prompt-fragments.ts`

- [x] **Task 3.2**: Update `IPromptProvider` interface in `backend/lib/core/prompts/prompt-provider.ts`
  - Add `getArchitecturePlanningPrompt(userPrompt, intent)` method
  - Add `getPlanReviewPrompt(plan)` method
  - Add `getPhasePrompt(phase, plan, context, userPrompt, recipe?)` method
  - Add token budgets for new stages to `tokenBudgets` object

- [x] **Task 3.3**: Implement in `backend/lib/core/prompts/api/api-prompt-provider.ts`
  - `getArchitecturePlanningPrompt()`: request full ArchitecturePlan JSON with typeContracts, cssVariables, stateShape, layer assignments
  - `getPlanReviewPrompt()`: validate plan consistency, return corrections
  - `getPhasePrompt()`: delegate to phase-prompts.ts, inject recipe fragments
  - Wire `recipe.phaseFragments[phase]` into prompt assembly via fragment registry

- [x] **Task 3.4**: Update recipe engine in `backend/lib/core/recipes/recipe-engine.ts`
  - Add `composePhasePrompt(recipe, phase, ...)` function
  - Looks up `recipe.phaseFragments[phase]` and concatenates fragments
  - Falls back to default SPA fragments if recipe has no phase-specific fragments

- [x] **Task 3.5**: Test prompt assembly
  - Each phase prompt includes expected sections (contracts, context, rules)
  - Recipe fragments injected correctly per phase
  - Prompt token estimation is within budget

**Files touched**:
- `backend/lib/core/prompts/phase-prompts.ts` (create)
- `backend/lib/core/prompts/prompt-provider.ts` (modify)
- `backend/lib/core/prompts/api/api-prompt-provider.ts` (modify)
- `backend/lib/core/recipes/recipe-engine.ts` (modify)

---

### PHASE 4: Phase Executor

> The engine that runs a single generation phase: prompt assembly -> AI call -> streaming -> parsing -> validation.

- [x] **Task 4.1**: Create `backend/lib/core/phase-executor.ts`
  - `PhaseExecutor` class with `executePhase(phaseDef, context, callbacks, signal?)` method
  - Assembles prompt using `getPhasePrompt()` + batch context
  - Calls `provider.generateStreaming()` with phase-specific token budget
  - Parses output with existing `parseIncrementalFiles()` from `incremental-json-parser.ts`
  - Emits files via callbacks as they stream
  - Returns `PhaseResult { files: GeneratedFile[], warnings: string[] }`

- [x] **Task 4.2**: Implement simple retry logic (decision 7A)
  - Max 2 attempts per phase
  - On first failure: retry with error feedback appended to prompt
  - On second failure: return partial results (or throw for scaffold phase)
  - Scaffold phase failure is HARD FAIL (throws, route returns 500)
  - Other phase failures: return whatever files were successfully parsed

- [x] **Task 4.3**: Implement truncation detection (decision 12A)
  - After phase execution, compare generated file paths against planned files for that layer
  - If missing files detected: run continuation call with only missing file paths
  - Continuation prompt includes: plan contracts + all already-generated files as context
  - Max 2 continuation rounds per phase
  - Use existing `parseIncrementalFiles()` for recovery from truncated JSON

- [x] **Task 4.4**: Implement post-phase validation
  - After each phase: run `BuildValidator.validate()` on accumulated files so far
  - For scaffold phase: verify package.json valid, types file exports all planned types, CSS has all planned vars
  - Collect validation errors for next phase's prompt context
  - Errors are NOT blocking — pipeline continues, review stage fixes

- [x] **Task 4.5**: Write tests for phase executor
  - Successful phase execution with mock AI provider
  - Retry: first attempt fails, second succeeds with error feedback
  - Scaffold failure -> thrown error (hard fail)
  - Non-scaffold failure -> returns partial results
  - Truncation detection: 3/5 files generated -> continuation call for remaining 2
  - Post-phase validation catches broken imports

**Files touched**:
- `backend/lib/core/phase-executor.ts` (create)
- Tests for above

---

### PHASE 5: Generation Pipeline (Core Orchestrator)

> The main orchestrator that replaces the generation path. Ties everything together.

- [x] **Task 5.1**: Create `backend/lib/core/generation-pipeline.ts`
  - `GenerationPipeline` class
  - Constructor takes: AI providers (intent, planning, execution, review, bugfix), prompt provider
  - Main method: `runGeneration(userPrompt, callbacks, signal?)` -> `GenerationResult`
  - Orchestrates: Intent -> Planning -> Plan Review -> Complexity Gate -> Execute -> Validate -> Review -> BugFix

- [x] **Task 5.2**: Implement enhanced planning stage
  - Call AI with `getArchitecturePlanningPrompt()`, token budget 8,192
  - Parse response with `ArchitecturePlanSchema`
  - On failure: fall back to heuristic plan builder
  - Select recipe from intent output (reuse existing `selectRecipe()`)

- [x] **Task 5.3**: Implement plan review stage (decision 1C)
  - Call AI with `getPlanReviewPrompt(plan)`, token budget 4,096
  - AI checks: import refs valid, type names consistent, layer assignments valid, no circular imports
  - On issues found: attempt auto-correction (remove dangling imports, add missing types)
  - Non-fatal: if review call fails, proceed with unreviewed plan

- [x] **Task 5.4**: Implement complexity gate (decision 3B)
  - `shouldUseMultiPhase(plan)`: returns true if plan.files.length > 10 OR estimated input tokens > 80% threshold
  - `estimateOneShotInputTokens(plan)`: estimate system prompt + contracts + user prompt size
  - One-shot path: use enhanced execution prompt with plan contracts injected (improved version of current behavior)
  - Multi-phase path: proceed to phase execution

- [x] **Task 5.5**: Implement phase merge logic (decision 8A)
  - Before multi-phase execution, check file count per layer
  - If logic layer has <=1 file: merge into UI phase
  - If integration layer has <=1 file: merge into UI phase
  - Return merged phase definitions with file lists

- [x] **Task 5.6**: Implement multi-phase execution loop
  - For each phase (scaffold -> logic -> ui -> integration):
    - Build context via `batch-context-builder.ts`
    - Execute via `PhaseExecutor`
    - Accumulate generated files
    - Run inter-phase validation
    - Pass validation errors to next phase
  - UI phase: split into sub-batches if >12 files
  - Emit `phase-start`/`phase-complete` events via callbacks

- [x] **Task 5.7**: Create `backend/lib/core/heuristic-plan-builder.ts`
  - `buildHeuristicPlan(intent, userPrompt)` -> `ArchitecturePlan`
  - Maps complexity -> file count and structure
  - Creates generic type stubs based on detected features (e.g., "todo" -> Todo interface)
  - Assigns files to layers by path conventions
  - Generates basic CSS variable set (colors, spacing, radii)
  - Used as fallback when AI planning fails

- [x] **Task 5.8**: Remove generation path from `PipelineOrchestrator` (decision 4B)
  - Remove `runGenerationPipeline()` method from `backend/lib/core/pipeline-orchestrator.ts`
  - Keep `runModificationPipeline()` and all modification-related code
  - Update class documentation to reflect modification-only role

- [x] **Task 5.9**: Update `backend/lib/core/pipeline-factory.ts`
  - Add `createGenerationPipeline()` factory method
  - Resolves AI providers for all stages (intent, planning, execution, review, bugfix)
  - Creates `GenerationPipeline` instance
  - Keep `createPipelineOrchestrator()` for modification path

- [x] **Task 5.10**: Update `backend/lib/core/streaming-generator.ts`
  - Replace `PipelineOrchestrator` usage with `GenerationPipeline` for generation
  - Map `GenerationPipeline` callbacks to existing SSE streaming callbacks
  - Keep `BaseProjectGenerator` inheritance for `runBuildFixLoop()`

- [x] **Task 5.11**: Write integration tests
  - Full pipeline with mock AI: simple prompt -> one-shot path
  - Full pipeline with mock AI: complex prompt -> multi-phase path
  - Planning failure -> heuristic fallback -> generation succeeds
  - Plan review catches issues -> auto-correction applied
  - Complexity gate correctly routes based on file count
  - Phase merge collapses sparse layers
  - Modification pipeline completely unaffected (regression test)

**Files touched**:
- `backend/lib/core/generation-pipeline.ts` (create)
- `backend/lib/core/heuristic-plan-builder.ts` (create)
- `backend/lib/core/pipeline-orchestrator.ts` (modify — remove generation path)
- `backend/lib/core/pipeline-factory.ts` (modify)
- `backend/lib/core/streaming-generator.ts` (modify)
- Tests for above

---

### PHASE 6: Streaming + Frontend

> SSE events for phase progress and frontend handling.

- [ ] **Task 6.1**: Add phase SSE events to `backend/app/api/generate-stream/route.ts`
  - Emit `phase-start` event: `{ phase, phaseIndex, totalPhases, filesInPhase }`
  - Emit `phase-complete` event: `{ phase, phaseIndex, filesGenerated, totalGenerated, totalPlanned }`
  - Map to existing backpressure controller (NORMAL priority for phase events)
  - One-shot path: emit single `phase-start`/`phase-complete` for compatibility

- [ ] **Task 6.2**: Update `frontend/src/utils/sse-parser.ts`
  - Handle `phase-start` event -> map to existing `onProgress` callback
  - Handle `phase-complete` event -> update progress label
  - Display: "Generating scaffold (4/20 files)..." -> "Generating UI components (12/20 files)..."
  - Falls back gracefully if events not present (backward compatible)

- [ ] **Task 6.3**: Test SSE events
  - Phase events emitted in correct order during multi-phase generation
  - One-shot path emits compatible events
  - Frontend displays phase progress text correctly

**Files touched**:
- `backend/app/api/generate-stream/route.ts` (modify)
- `frontend/src/utils/sse-parser.ts` (modify)

---

### PHASE 7: Test Migration + Eval Suite

> Ensure comprehensive test coverage for the new pipeline.

- [ ] **Task 7.1**: Migrate generation tests
  - Move generation-related test cases from `backend/lib/core/__tests__/pipeline-orchestrator.test.ts` to new `backend/lib/core/__tests__/generation-pipeline.test.ts`
  - Keep modification-related test cases in the original file
  - Update mocks to use `GenerationPipeline` instead of `PipelineOrchestrator`
  - Verify all migrated tests pass

- [ ] **Task 7.2**: Add eval cases to `backend/lib/core/__tests__/eval/eval.test.ts`
  - **Simple**: "Build a counter app" -> expect 5-8 files, verify types file exists, all imports resolve
  - **Medium**: "Build a todo app with search and categories" -> expect 12-16 files, verify type contracts, hooks match plan
  - **Complex**: "Build a project management app with dashboard, kanban board, and team views" -> expect 18-25 files, verify routing, contexts, all imports resolve
  - Each eval checks: file count within range, no broken imports, types/index.ts exports all planned types

- [ ] **Task 7.3**: Run full test suite and fix any regressions
  - `npm test` passes all workspaces
  - `npm run lint` passes
  - Modification pipeline tests still pass (regression check)

**Files touched**:
- `backend/lib/core/__tests__/generation-pipeline.test.ts` (create — migrated + new)
- `backend/lib/core/__tests__/pipeline-orchestrator.test.ts` (modify — remove generation tests)
- `backend/lib/core/__tests__/eval/eval.test.ts` (modify — add 3 eval cases)

---

## Token Budget Summary

| Stage | Output Tokens | API Calls | Notes |
|-------|--------------|-----------|-------|
| Intent | 512 | 1 | Unchanged |
| Architecture Planning | 8,192 | 1 | 2x current |
| Plan Review | 4,096 | 1 | NEW |
| Scaffold | 6,000 | 1 | Types + pkg + CSS + entry |
| Logic Layer | 10,000 | 0-1 | Skipped if <=1 file |
| UI Layer | 20,000 | 1-2 | Split if >12 files |
| Integration | 8,000 | 1 | Pages + App.tsx + routing |
| Review | 32,768 | 1 | Full project review |
| Bugfix (if needed) | 16,384 | 0-3 | Auto-fix retries |
| **Total** | **~90K-106K** | **7-11** | vs current ~70K / 4 calls |

### Cost Comparison (OpenRouter)

- **Simple project (8 files)**: ~$0.08 -> ~$0.10 (enhanced planning, still one-shot)
- **Medium project (14 files)**: ~$0.12 -> ~$0.20 (multi-phase, reliable)
- **Complex project (20 files)**: FAILS -> ~$0.28 (was impossible, now works)

---

## Context Budget Per Phase

| Phase | Types | Direct Deps | Summaries | CSS Vars | Contracts | Total Input |
|-------|-------|-------------|-----------|----------|-----------|-------------|
| Scaffold | - | - | - | - | ~500 | ~500 |
| Logic | ~500 | - | - | ~100 | ~800 | ~1,400 |
| UI | ~500 | ~2,000 | ~800 | ~100 | ~500 | ~3,900 |
| Integration | ~500 | ~1,500 | ~1,200 | ~100 | ~300 | ~3,600 |

---

## Files to Create

| File | Purpose |
|------|---------|
| `backend/lib/core/generation-pipeline.ts` | New orchestrator for generation |
| `backend/lib/core/phase-executor.ts` | Executes single phase with retry + truncation detection |
| `backend/lib/core/batch-context-builder.ts` | Builds context per phase (data-driven paths) |
| `backend/lib/core/heuristic-plan-builder.ts` | Fallback plan when AI planning fails |
| `backend/lib/core/prompts/phase-prompts.ts` | System prompts for each generation phase |
| `backend/lib/core/__tests__/generation-pipeline.test.ts` | Migrated + new generation tests |

## Files to Modify

| File | Change |
|------|--------|
| `backend/lib/core/schemas.ts` | Add `ArchitecturePlanSchema` |
| `backend/lib/core/pipeline-orchestrator.ts` | Remove generation path; keep modification only |
| `backend/lib/core/pipeline-factory.ts` | Create `GenerationPipeline`; route generation to it |
| `backend/lib/core/streaming-generator.ts` | Use `GenerationPipeline` for generation |
| `backend/lib/core/prompts/prompt-provider.ts` | Add new prompt method signatures |
| `backend/lib/core/prompts/api/api-prompt-provider.ts` | Implement new prompt methods |
| `backend/lib/core/recipes/recipe-types.ts` | Add `phaseFragments` to `GenerationRecipe` |
| `backend/lib/core/recipes/recipe-engine.ts` | Add `composePhasePrompt()` function |
| `backend/lib/constants.ts` | Add phase token budgets |
| `backend/app/api/generate-stream/route.ts` | Add phase SSE events |
| `frontend/src/utils/sse-parser.ts` | Handle phase progress events |
| `backend/lib/core/__tests__/eval/eval.test.ts` | Add 3 eval cases |

## Files Unchanged

- `backend/lib/core/build-validator.ts` — reused as-is
- `backend/lib/core/file-processor.ts` — reused as-is
- `backend/lib/core/validation-pipeline.ts` — reused as-is
- `backend/lib/ai/*` — all AI provider code unchanged
- `backend/lib/diff/*` — modification pipeline unchanged
- `backend/lib/analysis/file-planner/` — ChunkIndexBuilder reused via adapter

---

## Failure Modes

| Codepath | Failure | Handling | Tested By |
|----------|---------|----------|-----------|
| Planning fails | Malformed JSON | Heuristic fallback builder | Task 5.7, 5.11 |
| Plan review fails | AI misses issues | Non-fatal, review stage catches downstream | Task 5.3, 5.11 |
| Scaffold phase fails | Missing type from contracts | Post-phase validation -> retry -> hard fail (500) | Task 4.5 |
| Phase output truncated | Hits token limit mid-file | Truncation detection + continuation call | Task 4.3, 4.5 |
| One-shot input overflow | Plan contracts + prompt too large | Input budget check -> switch to multi-phase | Task 5.4, 5.11 |
| Non-scaffold phase fails | Hook doesn't match signature | Retry once -> continue partial -> review fixes | Task 4.2, 4.5 |

---

## Verification Plan

- [ ] **Unit tests**: batch-context-builder, phase-executor, complexity gate, phase merge, schema validation
- [ ] **Integration tests**: Full pipeline with mock AI (both one-shot and multi-phase paths)
- [ ] **Eval suite**: 3 prompts (counter app, todo app, task manager) — verify file count, contract compliance, import resolution
- [ ] **Manual E2E — Simple**: "counter app" -> 5-8 files via one-shot, working in Sandpack
- [ ] **Manual E2E — Medium**: "todo app with search" -> 12-16 files via multi-phase, working
- [ ] **Manual E2E — Complex**: "project management with dashboard and kanban" -> 18-25 files, working
- [ ] **Regression**: Modification pipeline (`/api/modify-stream`) completely unaffected
- [ ] **Streaming UX**: Phase progress visible in frontend during generation

---

## NOT in Scope (Deferred)

| Item | Rationale |
|------|-----------|
| Modal prompt provider per-phase updates | Focus on OpenRouter first; add Modal verbose variants later |
| Non-streaming `/api/generate` route update | Rarely used; can stay on old code temporarily |
| Frontend component redesign for phase UI | Existing `LoadingIndicator` + `progressLabel` sufficient |
| Contract validator as separate module | Plan review + BuildValidator cover this |
| Modification pipeline changes | Explicitly isolated by clean split |

---

## Schema Reference: `ArchitecturePlan`

```typescript
ArchitecturePlanSchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    purpose: z.string(),
    layer: z.enum(['scaffold', 'logic', 'ui', 'integration']),
    exports: z.array(z.string()),
    imports: z.array(z.string()),
  })),
  components: z.array(z.string()),
  dependencies: z.array(z.string()),
  routing: z.array(z.string()),

  typeContracts: z.array(z.object({
    name: z.string(),
    definition: z.string(),
  })),

  cssVariables: z.array(z.object({
    name: z.string(),
    value: z.string(),
    purpose: z.string(),
  })),

  stateShape: z.object({
    contexts: z.array(z.object({
      name: z.string(),
      stateFields: z.array(z.string()),
      actions: z.array(z.string()),
    })).optional(),
    hooks: z.array(z.object({
      name: z.string(),
      signature: z.string(),
      purpose: z.string(),
    })).optional(),
  }).optional(),
});
```

## Recipe Extension: `phaseFragments`

```typescript
interface GenerationRecipe {
  // ... existing fields ...
  phaseFragments?: {
    scaffold?: string[];
    logic?: string[];
    ui?: string[];
    integration?: string[];
  };
}
```
