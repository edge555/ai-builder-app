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

| Role | OpenRouter Model | OpenRouter Env Override | Modal ENV | Modal model |
|------|-----------------|------------------------|-----------|-------------|
| Intent | `thudm/glm-4.5-air` | `OPENROUTER_INTENT_MODEL` | `MODAL_INTENT_URL` | GLM-4.5-Air endpoint |
| Planning | `google/gemini-2.5-flash` | `OPENROUTER_PLANNING_MODEL` | `MODAL_PLANNING_URL` | GLM-4.5-Air endpoint |
| Execution | `google/gemini-2.5-flash` | `OPENROUTER_EXECUTION_MODEL` | `MODAL_EXECUTION_URL` | Task-specific endpoint |
| Bug Fix | `thudm/glm-5` | `OPENROUTER_BUGFIX_MODEL` | `MODAL_BUGFIX_URL` | GLM-5 endpoint |
| Review | `thudm/glm-5` | `OPENROUTER_REVIEW_MODEL` | `MODAL_REVIEW_URL` | GLM-5 endpoint |

**Model selection priority (OpenRouter):** env var override → `agent-config.json` → built-in default.
**Model selection priority (Modal):** task-specific URL env var → `MODAL_DEFAULT_URL`.

### Fallback chain in `agent-config.json`

| Task | Primary (priority 0) | Fallback (priority 1) |
|------|----------------------|-----------------------|
| intent | `thudm/glm-4.5-air` | `anthropic/claude-haiku-4-5` |
| planning | `google/gemini-2.5-flash` | `deepseek/deepseek-r1` |
| execution | `google/gemini-2.5-flash` | `anthropic/claude-haiku-4-5` |
| bugfix | `thudm/glm-5` | `anthropic/claude-haiku-4-5` |
| review | `thudm/glm-5` | `anthropic/claude-haiku-4-5` |

---

## Phase 1 — Types & Config ✅

> Foundational. Must compile cleanly before any other phase.

- [x] **`backend/lib/ai/agent-config-types.ts`** — Replace `TaskType` with `'intent' | 'planning' | 'execution' | 'bugfix' | 'review'`. Keep `ModelEntry`, `TaskConfig`, `AgentConfig` unchanged.
- [x] **`backend/lib/ai/agent-config-store.ts`**
  - Update `TASK_TYPES` array to 5 new values
  - Update `load()`: if persisted file has unknown task types (old schema), replace with new default config — handles migration automatically
- [x] **`backend/lib/constants.ts`** — Add per-stage token budgets:
  ```
  MAX_OUTPUT_TOKENS_INTENT = 512
  MAX_OUTPUT_TOKENS_PLANNING_STAGE = 4096
  MAX_OUTPUT_TOKENS_REVIEW = 32768        // full-file corrections
  MODAL_MAX_OUTPUT_TOKENS_INTENT = 1024
  MODAL_MAX_OUTPUT_TOKENS_PLANNING_STAGE = 8192
  MODAL_MAX_OUTPUT_TOKENS_REVIEW = 32768
  ```
- [x] **`backend/lib/config.ts`**
  - Add 10 new optional Modal env vars: `MODAL_DEFAULT_URL`, `MODAL_DEFAULT_STREAM_URL`, `MODAL_INTENT_URL`, `MODAL_INTENT_STREAM_URL`, `MODAL_PLANNING_URL`, `MODAL_PLANNING_STREAM_URL`, `MODAL_EXECUTION_URL`, `MODAL_EXECUTION_STREAM_URL`, `MODAL_BUGFIX_URL`, `MODAL_BUGFIX_STREAM_URL`, `MODAL_REVIEW_URL`, `MODAL_REVIEW_STREAM_URL`
  - Add 5 new OpenRouter model override env vars with defaults: `OPENROUTER_INTENT_MODEL`, `OPENROUTER_PLANNING_MODEL`, `OPENROUTER_EXECUTION_MODEL`, `OPENROUTER_BUGFIX_MODEL`, `OPENROUTER_REVIEW_MODEL`
  - Remove old `MODAL_API_URL` / `MODAL_STREAM_API_URL`
  - Validation: if `AI_PROVIDER=modal`, require `MODAL_DEFAULT_URL`
  - Extend `getMaxOutputTokens()` to accept `'intent' | 'planning_stage' | 'review'`
- [x] **`backend/lib/ai/agent-router.ts`** — When building model list for a task type: check `OPENROUTER_<TASK>_MODEL` env override first (sole model if set), otherwise use `getActiveModelsForTask()` from `agent-config.json`
- [x] **`backend/data/agent-config.json`** — Rewrite with 5 new task types, primary + fallback entries per table above
- [x] **`backend/lib/core/schemas.ts`** — Add 3 new Zod schemas:
  - `IntentOutputSchema` → `{ clarifiedGoal, complexity, features[], technicalApproach }`
  - `PlanOutputSchema` → `{ files:[{path,purpose}], components[], dependencies[], routing[] }`
  - `ReviewOutputSchema` → `{ verdict:'pass'|'fixed', corrections:[{path,content,reason}] }`
- [x] **Compilation fixes** — Updated `intent-detector.ts`, `ai-provider-factory.ts`, `modification-engine.ts`, `streaming-generator.ts`, `project-generator.ts`, `agent-config/route.ts`, `health/route.ts` to use new task types

---

## Phase 2 — Modal Multi-Model Factory

- [x] **NEW `backend/lib/ai/modal-pipeline-factory.ts`** — `createModalClientForTask(taskType)`: resolves `MODAL_<TASK>_URL` → falls back to `MODAL_DEFAULT_URL` → throws if neither set. Returns `new ModalClient({ apiUrl, streamApiUrl, apiKey, timeout })`.
- [x] **`backend/lib/ai/modal-client.ts`** — Remove `createModalClient()` export (replaced by factory). `ModalClient` class unchanged.
- [x] **`backend/lib/ai/ai-provider-factory.ts`**
  - Modal path: call `createModalClientForTask(taskType)` instead of `createModalClient()`
  - `detectIntent()` Modal mode: return `'execution'` instead of `'coding'`

---

## Phase 3 — Prompt System

- [x] **NEW `backend/lib/core/prompts/prompt-provider.ts`** — Define `IPromptProvider` interface:
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
- [x] **NEW `backend/lib/core/prompts/prompt-provider-factory.ts`** — `createPromptProvider(providerName: 'modal' | 'openrouter'): IPromptProvider`
- [x] **NEW `backend/lib/core/prompts/api/api-prompt-provider.ts`** — OpenRouter implementation. Concise prompts. Imports utility functions from `generation-prompt-utils.ts`. Token budgets match API constants.
- [x] **NEW `backend/lib/core/prompts/modal/modal-prompt-provider.ts`** — Modal implementation. Verbose prompts, full fragment inclusion, `includeDetailedGuidance: true`. Token budgets match Modal constants.
- [x] **`backend/lib/core/prompts/generation-prompt-utils.ts`** (NEW) — utility functions extracted and exported: `detectComplexity()`, `getFileRequirements()`, `shouldIncludeDesignSystem()`, `getQualityBarReference()`. `generation-prompt.ts` re-exports from here for backward compat; full deletion deferred to Phase 5 when generator callers are rewired.
- [x] **`backend/lib/core/prompts/provider-prompt-config.ts`** — Keep until Phase 5.3 removes the last import. **Delete in Phase 5.3**.

---

## Phase 4 — Pipeline Orchestrator

- [ ] **NEW `backend/lib/core/pipeline-orchestrator.ts`** (~280 lines)
  - `PipelineStage = 'intent' | 'planning' | 'execution' | 'review'` (aligns with `TaskType`; `bugfix` omitted — it's an internal loop)
  - `PipelineCallbacks`: `onStageStart`, `onStageComplete`, `onStageFailed` (degraded, not fatal), `onExecutionChunk`, `signal`
  - `PipelineResult`: `intentOutput | null`, `planOutput | null`, `executorFiles[]`, `reviewOutput | null`, `finalFiles[]`
  - `PipelineOrchestrator` constructor: `intentProvider, planningProvider, executionProvider, reviewProvider, promptProvider`
  - `runGenerationPipeline(userPrompt, callbacks, options?)`: intent (graceful) → planning (graceful) → execution (hard-fail) → review (graceful) → `mergeReviewCorrections()`
  - `runModificationPipeline(userPrompt, currentFiles, fileSlices, callbacks, options?)`: same stages. `fileSlices` = FilePlanner output passed in by `ModificationEngine` before calling this method
  - `mergeReviewCorrections(executorFiles, reviewOutput)`: path-keyed overlay of corrections
- [ ] **NEW `backend/lib/core/pipeline-factory.ts`**
  - `createPipelineOrchestrator()`: creates 4 AI providers in `Promise.all()` + prompt provider
  - `createStreamingProjectGenerator()`: creates orchestrator + `createAIProvider('bugfix')` + `createPromptProvider()`, injects all into `BaseProjectGenerator` constructor
  - `createModificationEngine()`: same wiring for `ModificationEngine`

---

## Phase 5 — Wire Into Generators

### 5.1 — Streaming Generator

- [ ] **`backend/lib/core/streaming-generator.ts`**
  - Replace `constructor(aiProvider: AIProvider)` with `constructor(private pipeline: PipelineOrchestrator)`
  - Call `pipeline.runGenerationPipeline(description, pipelineCallbacks, { requestId })`
  - Map `onStageStart/Complete/Failed` → emit `pipeline-stage` SSE event (NORMAL priority)
  - Map `onExecutionChunk` → existing `onProgress` / incremental `onFile` parse logic (unchanged)
  - `PipelineResult.finalFiles` replaces `response.content` parsed files
  - Continue with `processFiles` → `validationPipeline.validate` → `runBuildFixLoop` unchanged
  - Update `createStreamingProjectGenerator()` to call factory in `pipeline-factory.ts`

### 5.2 — Modification Engine

- [ ] **`backend/lib/diff/modification-engine.ts`**
  - Constructor takes `PipelineOrchestrator` (injected via `createModificationEngine()`)
  - Run `FilePlanner.selectRelevantSlices()` first, then pass slices into `pipeline.runModificationPipeline(userPrompt, currentFiles, fileSlices, callbacks)`
  - Extend `ModificationPhase` type: add `'intent' | 'reviewing'`
  - Merge review corrections into `updatedFiles` before `validateAndFixBuild`

### 5.3 — Base Generator Bugfix

- [ ] **`backend/lib/core/base-project-generator.ts`**
  - Add `bugfixProvider: AIProvider` and `promptProvider: IPromptProvider` as constructor parameters (injected, not self-created)
  - `runBuildFixLoop()` uses `bugfixProvider.generate()` + `promptProvider.getBugfixSystemPrompt()`
  - Remove dependency on `provider-prompt-config.ts` — use `promptProvider.tokenBudgets.bugfix`
- [ ] **Delete `backend/lib/core/prompts/provider-prompt-config.ts`** (last import removed in this step)

---

## Phase 6 — SSE Route Updates

> Pipeline-stage SSE events are **required** (not optional) for perceived responsiveness during 2–6s intent+planning wait.

- [ ] **`backend/app/api/generate-stream/route.ts`** — Add `pipeline-stage` event: priority NORMAL, payload `{ stage, label, status: 'start'|'complete'|'degraded' }`
- [ ] **`backend/app/api/modify-stream/route.ts`** — Remove `detectIntent()` call; pass through new pipeline stage labels via `onProgress`
- [ ] **`backend/app/api/modify/route.ts`** — Remove `detectIntent()` call (same reasoning as above)

> After both remove calls: `detectIntent()` in `ai-provider-factory.ts` is dead code — delete in Phase 8.

---

## Phase 7 — Settings Page

- [ ] **`frontend/src/pages/AgentSettingsPage.tsx`**
  - Update tab labels: intent → "Intent Analysis", planning → "Planning", execution → "Execution", bugfix → "Bug Fix", review → "Review"
  - Update Modal-mode disabled notice: _"In Modal mode, each stage uses a dedicated endpoint configured via `MODAL_<TASK>_URL` env vars."_
  - Show `envOverride` badge per tab when `OPENROUTER_<TASK>_MODEL` env var is set
- [ ] **`backend/app/api/agent-config/route.ts`** (GET handler) — Populate `envOverride` field per task if `OPENROUTER_<TASK>_MODEL` is set
- [ ] **`backend/lib/ai/agent-config-store.ts`** — Add `envOverride?: string` to `TaskConfig` (read-only, GET-only, never persisted; Zod PUT validation strips it)
- [ ] **`shared/src/types/`** — Add `envOverride?: string` to `TaskConfig` interface

---

## Phase 8 — Cleanup

- [ ] **`backend/lib/ai/intent-detector.ts`**
  - `FALLBACK_TASK`: `'coding'` → `'execution'`
  - `VALID_TASK_TYPES`: update to `['execution', 'bugfix', 'planning']`
  - Update system prompt classification labels
- [ ] **Delete `backend/lib/ai/ai-provider-factory.ts` `detectIntent()` export** (dead code after Phase 6)
- [ ] **Delete `backend/lib/core/prompts/generation-prompt.ts`** (replaced by `generation-prompt-utils.ts` in Phase 3)
- [ ] **Update `backend/lib/ai/__tests__/ai-provider-factory.test.ts`** — Replace `'coding'` → `'execution'`, `'debugging'` → `'bugfix'`; remove `'documentation'` test cases

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
