# Unified Prompt Architecture: Gemini + Modal (Qwen)

## Context

Currently, both Gemini and Modal use the same prompt functions (`getGenerationPrompt()`, `getModificationPrompt()`), but the prompts are designed conservatively around Gemini's per-token billing. Since Modal/Qwen is billed per GPU-hour (not per token), we can use much richer, more detailed prompts — which also helps because Qwen 7B is less capable than Gemini and benefits from explicit guidance.

**Goal:** Enrich prompts with detailed instructions, make output budget provider-aware, add Qwen-specific JSON output guidance, and keep all shared logic in one place.

---

## Phase 1: Provider Prompt Config

### Task 1.1: Create `provider-prompt-config.ts`

**New file:** `backend/lib/core/prompts/provider-prompt-config.ts`

```typescript
export interface ProviderPromptConfig {
  provider: 'gemini' | 'modal';
  outputBudgetTokens: number;
  includeDetailedGuidance: boolean; // true for Qwen (less capable, needs more detail)
}

export function getProviderPromptConfig(): ProviderPromptConfig {
  const provider = (process.env.AI_PROVIDER ?? 'gemini') as 'gemini' | 'modal';
  if (provider === 'modal') {
    return { provider: 'modal', outputBudgetTokens: 30000, includeDetailedGuidance: true };
  }
  return { provider: 'gemini', outputBudgetTokens: 15000, includeDetailedGuidance: false };
}
```

Auto-detects provider from `AI_PROVIDER` env var. No consumer changes needed.

---

## Phase 2: Expand Shared Prompt Fragments

### Task 2.1: Make `OUTPUT_BUDGET_GUIDANCE` provider-aware

**File:** `backend/lib/core/prompts/shared-prompt-fragments.ts`

Replace static `OUTPUT_BUDGET_GUIDANCE` with a function:

```typescript
export function getOutputBudgetGuidance(budgetTokens: number): string {
  return `=== OUTPUT CONSTRAINTS ===
- Your approximate output budget is ~${budgetTokens.toLocaleString()} tokens
- Keep components focused and under 80 lines each
- If a feature is complex, split it into multiple smaller files
- Generate the appropriate number of files for the requested complexity (not a fixed minimum)`;
}
```

### Task 2.2: Add detailed guidance fragments for Qwen

**File:** `backend/lib/core/prompts/shared-prompt-fragments.ts`

Add three new exported constants:

1. **`DETAILED_REACT_GUIDANCE`** — State management patterns, useEffect rules, event handling conventions, component composition, TypeScript patterns
2. **`DETAILED_CSS_GUIDANCE`** — CSS variable naming conventions, component CSS rules, responsive patterns, BEM naming
3. **`DETAILED_JSON_OUTPUT_GUIDANCE`** — Explicit rules: no markdown fences, proper escaping, complete files, no trailing commas, balanced braces

These are ~60 lines each, always available but only included conditionally.

---

## Phase 3: Wire Up Generation Prompt

### Task 3.1: Update `buildGenerationPrompt()`

**File:** `backend/lib/core/prompts/generation-prompt.ts`

- Import `getProviderPromptConfig` and the new detailed fragments
- Call `getProviderPromptConfig()` inside `buildGenerationPrompt()`
- When `cfg.includeDetailedGuidance === true`: insert `DETAILED_REACT_GUIDANCE`, `DETAILED_CSS_GUIDANCE`, `DETAILED_JSON_OUTPUT_GUIDANCE` into the prompt
- Replace `OUTPUT_BUDGET_GUIDANCE` with `getOutputBudgetGuidance(cfg.outputBudgetTokens)`
- No signature change to `getGenerationPrompt(userPrompt: string)` — it still returns string

---

## Phase 4: Wire Up Modification Prompt

### Task 4.1: Update `buildModificationPrompt()`

**File:** `backend/lib/diff/prompts/modification-prompt.ts`

Same pattern as generation:
- Import `getProviderPromptConfig` and detailed fragments
- Conditionally include detailed guidance when `includeDetailedGuidance` is true
- Use `getOutputBudgetGuidance()` (modification prompt currently doesn't have output budget — add it for Modal)

---

## Phase 5: Wire Up Planning Prompt

### Task 5.1: Convert `PLANNING_SYSTEM_PROMPT` to function

**File:** `backend/lib/analysis/file-planner/planning-prompt.ts`

- Create `getPlanningSystemPrompt()` function
- For Modal: append explicit JSON output reminders (no code fences, exact paths, include reasoning)
- Keep the existing static export for reference but mark deprecated

### Task 5.2: Update `file-planner.ts`

**File:** `backend/lib/analysis/file-planner/file-planner.ts`

- Replace `PLANNING_SYSTEM_PROMPT` import with `getPlanningSystemPrompt()`
- Call function where the constant was used

---

## Files Changed Summary

| File | Action | Description |
|------|--------|-------------|
| `backend/lib/core/prompts/provider-prompt-config.ts` | **CREATE** | Provider config type + auto-detection factory |
| `backend/lib/core/prompts/shared-prompt-fragments.ts` | MODIFY | Add `getOutputBudgetGuidance()`, `DETAILED_REACT_GUIDANCE`, `DETAILED_CSS_GUIDANCE`, `DETAILED_JSON_OUTPUT_GUIDANCE` |
| `backend/lib/core/prompts/generation-prompt.ts` | MODIFY | Use provider config, conditionally include detailed guidance |
| `backend/lib/diff/prompts/modification-prompt.ts` | MODIFY | Same as generation-prompt |
| `backend/lib/analysis/file-planner/planning-prompt.ts` | MODIFY | Convert to function with Qwen-specific reminders |
| `backend/lib/analysis/file-planner/file-planner.ts` | MODIFY | Use function instead of constant |

## What Does NOT Change

- `modal-client.ts` — JSON schema hint in `formatPrompt()` stays (transport-level, not prompt content)
- `streaming-generator.ts`, `project-generator.ts`, `modification-engine.ts` — they call `getGenerationPrompt()`/`getModificationPrompt()` which auto-detect provider internally
- `build-fix-prompt.ts` — user-level prompt, not system instructions
- `prompt-builder.ts` — code context assembly, provider-agnostic
- `config.ts` / `constants.ts` — token limits already provider-aware
- `modal-code-ai/app.py` — no server-side changes needed

## Verification

1. Set `AI_PROVIDER=modal` in `.env`, run the app, submit a generation request
2. Check backend logs for `systemInstructionLength` — should be significantly larger than before (~2-3x)
3. Verify Qwen generates valid JSON output with proper React components
4. Set `AI_PROVIDER=gemini`, verify prompts remain the same size as before (no regression)
5. Test modification flow with both providers
