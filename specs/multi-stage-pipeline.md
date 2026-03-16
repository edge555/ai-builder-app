# Spec: Multi-Stage AI Pipeline Refactor

## Context

Modal is billed per compute time (not per token), so longer prompts and multi-model pipelines are free. This refactor replaces the current single-model AI call with a 4-stage sequential pipeline for both generation and modification flows. The same 5 task types unify both Modal and OpenRouter paths. No backward compatibility needed.

## Pipeline Flow

```
User Input
  ↓ [Intent — GLM-4.5-Air] → { clarifiedGoal, complexity, features, technicalApproach }
  ↓ [Planner — Gemini 2.5 Flash (API) / GLM-4.5-Air (Modal)] → { files:[{path,purpose}], components, dependencies, routing }
  ↓ [Executor — Gemini 2.5 Flash, STREAMING] → { files:[{path,content}] }
  ↓ [Reviewer — GLM-5] → { verdict:'pass'|'fixed', corrections:[{path,content,reason}] }
  ↓ merge corrections → processFiles → validationPipeline → buildFixLoop (bugfix model)
```

**Graceful degradation:** intent / planning / review failures are non-fatal — pipeline continues with `null` for that stage's output. Execution failure is hard-fail.

## Model Assignments

| Role      | OpenRouter Model            | OpenRouter Env Override        | Modal ENV               | Modal model            |
| --------- | --------------------------- | ------------------------------ | ----------------------- | ---------------------- |
| Intent    | `thudm/glm-4.5-air`       | `OPENROUTER_INTENT_MODEL`    | `MODAL_INTENT_URL`    | GLM-4.5-Air endpoint   |
| Planning  | `google/gemini-2.5-flash` | `OPENROUTER_PLANNING_MODEL`  | `MODAL_PLANNING_URL`  | GLM-4.5-Air endpoint   |
| Execution | `google/gemini-2.5-flash` | `OPENROUTER_EXECUTION_MODEL` | `MODAL_EXECUTION_URL` | Task-specific endpoint |
| Bug Fix   | `thudm/glm-5`             | `OPENROUTER_BUGFIX_MODEL`    | `MODAL_BUGFIX_URL`    | GLM-5 endpoint         |
| Review    | `thudm/glm-5`             | `OPENROUTER_REVIEW_MODEL`    | `MODAL_REVIEW_URL`    | GLM-5 endpoint         |

**Model selection priority (OpenRouter):** env var override → `agent-config.json` → built-in default.
**Model selection priority (Modal):** task-specific URL env var → `MODAL_DEFAULT_URL`.

### Fallback chain in `agent-config.json`

| Task      | Primary (priority 0)        | Fallback (priority 1)          |
| --------- | --------------------------- | ------------------------------ |
| intent    | `thudm/glm-4.5-air`       | `anthropic/claude-haiku-4-5` |
| planning  | `google/gemini-2.5-flash` | `deepseek/deepseek-r1`       |
| execution | `google/gemini-2.5-flash` | `anthropic/claude-haiku-4-5` |
| bugfix    | `thudm/glm-5`             | `anthropic/claude-haiku-4-5` |
| review    | `thudm/glm-5`             | `anthropic/claude-haiku-4-5` |

---

## Phase 1 — Types & Config ✅

> Foundational. Must compile cleanly before any other phase.

- [X] **`backend/lib/ai/agent-config-types.ts`** — Replace `TaskType` with `'intent' | 'planning' | 'execution' | 'bugfix' | 'review'`. Keep `ModelEntry`, `TaskConfig`, `AgentConfig` unchanged.
- [X] **`backend/lib/ai/agent-config-store.ts`**
  - Update `TASK_TYPES` array to 5 new values
  - Update `load()`: if persisted file has unknown task types (old schema), replace with new default config — handles migration automatically
- [X] **`backend/lib/constants.ts`** — Add per-stage token budgets:
  ```
  MAX_OUTPUT_TOKENS_INTENT = 512
  MAX_OUTPUT_TOKENS_PLANNING_STAGE = 4096
  MAX_OUTPUT_TOKENS_REVIEW = 32768        // full-file corrections
  MODAL_MAX_OUTPUT_TOKENS_INTENT = 1024
  MODAL_MAX_OUTPUT_TOKENS_PLANNING_STAGE = 8192
  MODAL_MAX_OUTPUT_TOKENS_REVIEW = 32768
  ```
- [X] **`backend/lib/config.ts`**
  - Add 10 new optional Modal env vars: `MODAL_DEFAULT_URL`, `MODAL_DEFAULT_STREAM_URL`, `MODAL_INTENT_URL`, `MODAL_INTENT_STREAM_URL`, `MODAL_PLANNING_URL`, `MODAL_PLANNING_STREAM_URL`, `MODAL_EXECUTION_URL`, `MODAL_EXECUTION_STREAM_URL`, `MODAL_BUGFIX_URL`, `MODAL_BUGFIX_STREAM_URL`, `MODAL_REVIEW_URL`, `MODAL_REVIEW_STREAM_URL`
  - Add 5 new OpenRouter model override env vars with defaults: `OPENROUTER_INTENT_MODEL`, `OPENROUTER_PLANNING_MODEL`, `OPENROUTER_EXECUTION_MODEL`, `OPENROUTER_BUGFIX_MODEL`, `OPENROUTER_REVIEW_MODEL`
  - Remove old `MODAL_API_URL` / `MODAL_STREAM_API_URL`
  - Validation: if `AI_PROVIDER=modal`, require `MODAL_DEFAULT_URL`
  - Extend `getMaxOutputTokens()` to accept `'intent' | 'planning_stage' | 'review'`
- [X] **`backend/lib/ai/agent-router.ts`** — When building model list for a task type: check `OPENROUTER_<TASK>_MODEL` env override first (sole model if set), otherwise use `getActiveModelsForTask()` from `agent-config.json`
- [X] **`backend/data/agent-config.json`** — Rewrite with 5 new task types, primary + fallback entries per table above
- [X] **`backend/lib/core/schemas.ts`** — Add 3 new Zod schemas:
  - `IntentOutputSchema` → `{ clarifiedGoal, complexity, features[], technicalApproach }`
  - `PlanOutputSchema` → `{ files:[{path,purpose}], components[], dependencies[], routing[] }`
  - `ReviewOutputSchema` → `{ verdict:'pass'|'fixed', corrections:[{path,content,reason}] }`
- [X] **Compilation fixes** — Updated `intent-detector.ts`, `ai-provider-factory.ts`, `modification-engine.ts`, `streaming-generator.ts`, `project-generator.ts`, `agent-config/route.ts`, `health/route.ts` to use new task types

---

## Phase 2 — Modal Multi-Model Factory

- [X] **NEW `backend/lib/ai/modal-pipeline-factory.ts`** — `createModalClientForTask(taskType)`: resolves `MODAL_<TASK>_URL` → falls back to `MODAL_DEFAULT_URL` → throws if neither set. Returns `new ModalClient({ apiUrl, streamApiUrl, apiKey, timeout })`.
- [X] **`backend/lib/ai/modal-client.ts`** — Remove `createModalClient()` export (replaced by factory). `ModalClient` class unchanged.
- [X] **`backend/lib/ai/ai-provider-factory.ts`**
  - Modal path: call `createModalClientForTask(taskType)` instead of `createModalClient()`
  - `detectIntent()` Modal mode: return `'execution'` instead of `'coding'`

---

## Phase 3 — Prompt System

- [X] **NEW `backend/lib/core/prompts/prompt-provider.ts`** — Define `IPromptProvider` interface:
  ```typescript
  interface IPromptProvider {
    getIntentSystemPrompt(): string;
    getPlanningSystemPrompt(userPrompt: string, intent: IntentOutput | null): string;
    getExecutionGenerationSystemPrompt(userPrompt: string, intent: IntentOutput | null, plan: PlanOutput | null): string;
    getExecutionModificationSystemPrompt(userPrompt: string, intent: IntentOutput | null, plan: PlanOutput | null, designSystem: boolean): string;
    getReviewSystemPrompt(): string;
    getBugfixSystemPrompt(errorContext: string, failureHistory: string[]): string;
    tokenBudgets: { intent: number; planning: number; executionGeneration: number; executionModification: number; review: number; bugfix: number; };
  }
  ```
- [X] **NEW `backend/lib/core/prompts/prompt-provider-factory.ts`** — `createPromptProvider(providerName: 'modal' | 'openrouter'): IPromptProvider`
- [X] **NEW `backend/lib/core/prompts/api/api-prompt-provider.ts`** — OpenRouter implementation. Concise prompts. Imports utility functions from `generation-prompt-utils.ts`. Token budgets match API constants.
- [X] **NEW `backend/lib/core/prompts/modal/modal-prompt-provider.ts`** — Modal implementation. Verbose prompts, full fragment inclusion, `includeDetailedGuidance: true`. Token budgets match Modal constants.
- [X] **`backend/lib/core/prompts/generation-prompt-utils.ts`** (NEW) — utility functions extracted and exported: `detectComplexity()`, `getFileRequirements()`, `shouldIncludeDesignSystem()`, `getQualityBarReference()`. `generation-prompt.ts` re-exports from here for backward compat; full deletion deferred to Phase 5 when generator callers are rewired.
- [X] **`backend/lib/core/prompts/provider-prompt-config.ts`** — Keep until Phase 5.3 removes the last import. **Delete in Phase 5.3**.

---

## Phase 4 — Pipeline Orchestrator

- [X] **NEW `backend/lib/core/pipeline-orchestrator.ts`** (~280 lines)
  - `PipelineStage = 'intent' | 'planning' | 'execution' | 'review'` (aligns with `TaskType`; `bugfix` omitted — it's an internal loop)
  - `PipelineCallbacks`: `onStageStart`, `onStageComplete`, `onStageFailed` (degraded, not fatal), `onExecutionChunk`, `signal`
  - `PipelineResult`: `intentOutput | null`, `planOutput | null`, `executorFiles[]`, `reviewOutput | null`, `finalFiles[]`
  - `PipelineOrchestrator` constructor: `intentProvider, planningProvider, executionProvider, reviewProvider, promptProvider`
  - `runGenerationPipeline(userPrompt, callbacks, options?)`: intent (graceful) → planning (graceful) → execution (hard-fail) → review (graceful) → `mergeReviewCorrections()`
  - `runModificationPipeline(userPrompt, currentFiles, fileSlices, callbacks, options?)`: same stages. `fileSlices` = FilePlanner output passed in by `ModificationEngine` before calling this method
  - `mergeReviewCorrections(executorFiles, reviewOutput)`: path-keyed overlay of corrections
- [X] **NEW `backend/lib/core/pipeline-factory.ts`**
  - `createPipelineOrchestrator()`: creates 4 AI providers in `Promise.all()` + prompt provider
  - `createStreamingProjectGenerator()` and `createModificationEngine()`: deferred to Phase 5 (require constructor changes in 5.1–5.3)

---

## Phase 5 — Wire Into Generators ✅

### 5.1 — Streaming Generator

- [X] **`backend/lib/core/streaming-generator.ts`**
  - Replace `constructor(aiProvider: AIProvider)` with `constructor(private pipeline: PipelineOrchestrator)`
  - Call `pipeline.runGenerationPipeline(description, pipelineCallbacks, { requestId })`
  - Map `onStageStart/Complete/Failed` → `onPipelineStage` callback in `StreamingCallbacks` (wired to SSE in Phase 6)
  - Map `onExecutionChunk` → existing `onProgress` / incremental `onFile` parse logic (unchanged)
  - `PipelineResult.finalFiles` replaces `response.content` parsed files
  - Continue with `processFiles` → `validationPipeline.validate` → `runBuildFixLoop` unchanged
  - Update `createStreamingProjectGenerator()` to call `createPipelineOrchestrator()` from `pipeline-factory.ts`

### 5.2 — Modification Engine

- [X] **`backend/lib/diff/modification-engine.ts`**
  - Constructor takes `PipelineOrchestrator` (injected via `createModificationEngine()`)
  - Run `FilePlanner.selectRelevantSlices()` first, then pass slices into `pipeline.runModificationPipeline(userPrompt, currentFiles, fileSlices, callbacks)`
  - Extend `ModificationPhase` type: add `'intent' | 'reviewing'`
  - Merge review corrections + apply modify ops → diff vs currentFiles → `validateAndFixBuild`
  - Fixed `pipeline-orchestrator.ts` `applyModificationsToFiles`: modify ops keep existing content for review; delete ops remove the file
- [X] **`backend/app/api/modify-stream/route.ts`** — Removed `detectIntent()` call
- [X] **`backend/app/api/modify/route.ts`** — Removed `detectIntent()` call

### 5.3 — Base Generator Bugfix

- [X] **`backend/lib/core/base-project-generator.ts`**
  - Constructor: `(bugfixProvider: AIProvider, promptProvider: IPromptProvider)` (injected, not self-created)
  - `runBuildFixLoop()` uses `bugfixProvider.generate()` + `promptProvider.getBugfixSystemPrompt()` + `promptProvider.tokenBudgets.bugfix`
  - Removed `mode` parameter (no longer needed; bugfix prompt is mode-agnostic)
- [X] **`backend/lib/core/project-generator.ts`** — Updated to use `(executionProvider, bugfixProvider, promptProvider)` constructor; uses `promptProvider.getExecutionGenerationSystemPrompt()` + `promptProvider.tokenBudgets.executionGeneration`

- Note: `provider-prompt-config.ts` deletion deferred — still used by `modification-prompt.ts` and `planning-prompt.ts` (Phase 8 cleanup)

---

## ✅ Phase 6 — SSE Route Updates

> Pipeline-stage SSE events are **required** (not optional) for perceived responsiveness during 2–6s intent+planning wait.

- [X] **`backend/app/api/generate-stream/route.ts`** — Add `pipeline-stage` event: priority NORMAL, payload `{ stage, label, status: 'start'|'complete'|'degraded' }`
- [X] **`backend/app/api/modify-stream/route.ts`** — Added `onPipelineStage` callback to `modifyProject()` options; emits `pipeline-stage` SSE events
- [X] **`backend/app/api/modify/route.ts`** — `detectIntent()` call removed (Phase 5)
- [X] **`backend/lib/diff/modification-engine.ts`** — Added `onPipelineStage` to `modifyProject()` options, wired through `PipelineCallbacks`
- [X] **`backend/lib/__tests__/diff/modification-engine.test.ts`** — Rewritten to use new 3-arg constructor with pipeline mock

> After both remove calls: `detectIntent()` in `ai-provider-factory.ts` is dead code — delete in Phase 8.

---

## ✅ Phase 7 — Settings Page

- [X] **`frontend/src/pages/AgentSettingsPage.tsx`**
  - Updated tab labels: intent → "Intent Analysis", planning → "Planning", execution → "Execution", bugfix → "Bug Fix", review → "Review"
  - Updated Modal-mode notice: _"In Modal mode, each stage uses a dedicated endpoint configured via `MODAL_<TASK>_URL` env vars."_
  - Added `env override` badge per tab when `envOverride` is populated in config
- [X] **`backend/app/api/agent-config/route.ts`** (GET handler) — Populates `envOverride` per task if `OPENROUTER_<TASK>_MODEL` env var is explicitly set in `process.env`
- [X] **`backend/lib/ai/agent-config-types.ts`** — Added `envOverride?: string` to `TaskConfig` (read-only; Zod PUT schema strips it on save)
- [X] **`frontend/src/services/agent-config-service.ts`** — Updated `TaskType` to new 5 values, added `envOverride?: string` to `TaskConfig`
- [X] **`backend/lib/ai/__tests__/agent-config-store.test.ts`** — Updated to new task types, added old-schema migration test
- [X] **`backend/app/api/__tests__/agent-config.test.ts`** — Updated to new task types, fixed `version: 1 as const` and rate-limit mock shape

---

## Phase 8 — Cleanup

- [X] **`backend/lib/ai/intent-detector.ts`**
  - `FALLBACK_TASK`: `'coding'` → `'execution'`
  - `VALID_TASK_TYPES`: update to `['execution', 'bugfix', 'planning']`
  - Update system prompt classification labels
- [X] **Delete `backend/lib/ai/ai-provider-factory.ts` `detectIntent()` export** (dead code after Phase 6)
- [X] **Delete `backend/lib/core/prompts/generation-prompt.ts`** (replaced by `generation-prompt-utils.ts` in Phase 3)
- [X] **Update `backend/lib/ai/__tests__/ai-provider-factory.test.ts`** — Replace `'coding'` → `'execution'`, `'debugging'` → `'bugfix'`; remove `'documentation'` test cases

---

## New Test Files

- [ ] **`backend/lib/ai/__tests__/modal-pipeline-factory.test.ts`**
  - `createModalClientForTask('intent')` with `MODAL_INTENT_URL` set → uses task URL
  - `createModalClientForTask('execution')` with only `MODAL_DEFAULT_URL` → falls back to default
  - `createModalClientForTask('planning')` with no URL at all → throws
  - All 5 task types resolve correctly
- [ ] **`backend/lib/core/__tests__/pipeline-orchestrator.test.ts`**
  - Intent fails → null, pipeline continues to planning
  - Planning fails → null, pipeline continues to execution
  - Review fails → null, `finalFiles` = `executorFiles` unchanged
  - Execution fails → `runGenerationPipeline` rejects
  - `mergeReviewCorrections()` overlays corrections by path (both `pass` and `fixed` verdicts)

---

## Verification Checklist

- [ ] Unit: pipeline-orchestrator graceful-fail paths all return null and continue
- [ ] Integration (generate): POST `/api/generate-stream` → 4x `pipeline-stage` SSE events before first `file` event
- [ ] Integration (modify): POST `/api/modify-stream` → same pipeline events
- [ ] Modal multi-model: set `MODAL_INTENT_URL` ≠ `MODAL_EXECUTION_URL` → verify different endpoints hit
- [ ] Fallback: mock intent provider to return `{ success: false }` → generation completes in degraded mode
- [ ] Build-fix: inject broken import in generated files → verify `bugfix` task type model is called

---

## Notes on Model IDs

Verify these slugs on OpenRouter before implementing:

- GLM-4.5-Air: check exact `thudm/` slug
- Gemini 2.5 Flash: `google/gemini-2.5-flash`
- GLM-5: check `thudm/glm-5` availability

Example `.env`:

```
OPENROUTER_INTENT_MODEL=thudm/glm-4.5-air
OPENROUTER_PLANNING_MODEL=google/gemini-2.5-flash
OPENROUTER_EXECUTION_MODEL=google/gemini-2.5-flash
OPENROUTER_BUGFIX_MODEL=thudm/glm-5
OPENROUTER_REVIEW_MODEL=thudm/glm-5
MODAL_DEFAULT_URL=https://your-modal-endpoint.modal.run
```
