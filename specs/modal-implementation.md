# Modal AI Provider Implementation Plan

## Context

The app currently uses Gemini API directly for all AI operations (generation, modification, planning, build-fix). We need to add Modal as an alternative AI provider, switchable via `AI_PROVIDER` env var. Modal hosts a Qwen model via a FastAPI endpoint. Non-streaming for Modal initially; streaming SSE to client still works (emits all files at once).

## Architecture

```
User Request → Route Handler → Generator/Engine → AIProvider.generate() → Gemini OR Modal
                                                                              ↓
                                              ← same validation/build-fix/SSE pipeline ←
```

The key abstraction: an `AIProvider` interface that both `GeminiClient` and `ModalClient` implement. Everything downstream (validation, build-fix, file processing, SSE) is unchanged.

---

## Implementation Steps

### Step 1: Create `AIProvider` interface ☐
**New file:** `backend/lib/ai/ai-provider.ts`

- [ ] Define `AIProvider` interface with `generate()` and `generateStreaming()` methods
- [ ] Define `AIRequest`, `AIStreamingRequest`, `AIResponse` as type aliases of existing Gemini types (they're already provider-agnostic in shape)
- [ ] This avoids duplicating type definitions

### Step 2: Create Modal response parser ☐
**New file:** `backend/lib/ai/modal-response-parser.ts`

- [ ] Implement `extractJsonFromResponse(rawText: string): string | null`
- [ ] Strategy 1: direct JSON parse
- [ ] Strategy 2: markdown code block extraction
- [ ] Strategy 3: brace-matching
- [ ] Needed because Modal has no `responseSchema` guarantee like Gemini

### Step 3: Create ModalClient ☐
**New file:** `backend/lib/ai/modal-client.ts`

- [ ] `ModalClient implements AIProvider`
- [ ] Config: `MODAL_API_URL`, `MODAL_API_KEY` (optional auth), timeout, retries
- [ ] `generate()`: POST to Modal endpoint with `{prompt, system_instruction, temperature, max_tokens}`, parse response with `extractJsonFromResponse`
- [ ] `generateStreaming()`: calls `generate()` internally, emits full content via `onChunk` callback once
- [ ] `formatPrompt()`: combines systemInstruction + cacheConfig parts + user prompt. Adds JSON instruction if `responseSchema` is present (since Modal can't enforce it)
- [ ] Retry/backoff/error categorization reuses same patterns as GeminiClient
- [ ] Future: `model` field in config for multi-model support

### Step 4: Create factory function ☐
**New file:** `backend/lib/ai/ai-provider-factory.ts`

- [ ] `createAIProvider(model?: string): AIProvider` — reads `AI_PROVIDER` env var, returns GeminiClient or ModalClient
- [ ] `createAIProviderWithModel(model: string): AIProvider` — same but with explicit model override

### Step 5: Update GeminiClient ☐
**Modify:** `backend/lib/ai/gemini-client.ts`

- [ ] Add `implements AIProvider` to class declaration
- [ ] No other changes needed (methods already match the interface)

### Step 6: Update config ☐
**Modify:** `backend/lib/config.ts`

- [ ] Add env vars: `AI_PROVIDER` (enum: gemini|modal, default: gemini), `MODAL_API_URL` (optional), `MODAL_API_KEY` (optional)
- [ ] Make `GEMINI_API_KEY` optional (`.default('')`)
- [ ] Add conditional validation after parse: require `GEMINI_API_KEY` when provider=gemini, require `MODAL_API_URL` when provider=modal
- [ ] Add `provider` section to `BackendConfig`

### Step 7: Update barrel export ☐
**Modify:** `backend/lib/ai/index.ts`

- [ ] Export new types: `AIProvider`, `AIRequest`, `AIStreamingRequest`, `AIResponse`
- [ ] Export new functions: `createAIProvider`, `createAIProviderWithModel`
- [ ] Export `ModalClient`, `createModalClient`
- [ ] Keep existing Gemini exports

### Step 8: Refactor consumers (GeminiClient → AIProvider) ☐

#### 8a. `backend/lib/core/base-project-generator.ts` ☐
- [ ] Change `protected readonly geminiClient: GeminiClient` → `protected readonly aiProvider: AIProvider`
- [ ] Change constructor: accept `AIProvider`, default to `createAIProvider()`
- [ ] Update `runBuildFixLoop()`: `this.geminiClient.generate()` → `this.aiProvider.generate()`

#### 8b. `backend/lib/core/streaming-generator.ts` ☐
- [ ] Change constructor parameter type to `AIProvider`
- [ ] Update `this.geminiClient.generateStreaming()` → `this.aiProvider.generateStreaming()`

#### 8c. `backend/lib/diff/modification-engine.ts` ☐
- [ ] Change `private readonly geminiClient: GeminiClient` → `private readonly aiProvider: AIProvider`
- [ ] Constructor: default to `createAIProviderWithModel(config.ai.hardModel)`
- [ ] Update all `this.geminiClient.generate()` calls

#### 8d. `backend/lib/analysis/file-planner/file-planner.ts` ☐
- [ ] Change `private geminiClient: GeminiClient | null` → `private aiProvider: AIProvider | null`
- [ ] Update `createFilePlanner()` factory

#### 8e. `backend/lib/analysis/file-planner/metadata-planner.ts` ☐
- [ ] Same pattern as file-planner.ts

### Step 9: Update Modal endpoint (app.py) ☐
**Modify:** Modal `app.py` (user's separate project)

- [ ] Expand `generate_api` to accept `{prompt, system_instruction, temperature, max_tokens}` as JSON body
- [ ] Update `CodeModel.generate()` to use system_instruction and parameters
- [ ] Return response as JSON: `{"content": "...", "model": "...", "usage": {...}}`

---

## Files to Create

| File | Purpose |
|------|---------|
| `backend/lib/ai/ai-provider.ts` | AIProvider interface and type aliases |
| `backend/lib/ai/modal-client.ts` | ModalClient implementation |
| `backend/lib/ai/modal-response-parser.ts` | JSON extraction utilities for Modal responses |
| `backend/lib/ai/ai-provider-factory.ts` | Factory function for creating providers |

## Files to Modify

| File | Changes |
|------|---------|
| `backend/lib/ai/gemini-client.ts` | Add `implements AIProvider` |
| `backend/lib/ai/index.ts` | Add new exports |
| `backend/lib/config.ts` | Add env vars, conditional validation |
| `backend/lib/core/base-project-generator.ts` | GeminiClient → AIProvider |
| `backend/lib/core/streaming-generator.ts` | GeminiClient → AIProvider |
| `backend/lib/diff/modification-engine.ts` | GeminiClient → AIProvider |
| `backend/lib/analysis/file-planner/file-planner.ts` | GeminiClient → AIProvider |
| `backend/lib/analysis/file-planner/metadata-planner.ts` | GeminiClient → AIProvider |

## Separate Project

- `modal-code-ai/app.py` — expand endpoint to accept structured request

---

## Verification Checklist

- [ ] Set `AI_PROVIDER=gemini` (default) — everything works as before
- [ ] Set `AI_PROVIDER=modal` + `MODAL_API_URL=<url>` — generation uses Modal endpoint
- [ ] Test: generate a project with Modal, verify files are created and displayed
- [ ] Test: build-fix loop still works with Modal (retries on build errors)
- [ ] Test: modification flow works with Modal
- [ ] Test: planning flow works with Modal
