# Performance Improvements & Code Quality Fixes

## Context

Comprehensive audit of the entire codebase (backend, frontend, shared, infrastructure) revealed 39 actionable findings. These include O(n²) hot paths in build validation, stale closure bugs in auto-repair, ~500 lines of dead code, and dependency/config cleanup. No backward compatibility or unit tests required.

---

## Group 1: Delete Dead Code (Zero Risk)

### ☐ 1.1 Delete MetadataFilePlanner files
- [ ] Delete `backend/lib/analysis/file-planner/metadata-planner.ts`
- [ ] Delete `backend/lib/analysis/file-planner/metadata-planning.ts`
- [ ] Delete `backend/lib/analysis/file-planner/metadata-fallback.ts`
- [ ] Remove corresponding exports from `backend/lib/analysis/file-planner/index.ts`

### ☐ 1.2 Delete HistoryPanel and VersionContext
- [ ] Delete `frontend/src/components/HistoryPanel/` directory
- [ ] Delete `frontend/src/context/VersionContext.tsx` and `VersionContext.context.ts`
- [ ] Delete `frontend/src/context/__tests__/VersionContext.test.tsx`
- [ ] Remove exports from `frontend/src/components/index.ts` and `frontend/src/context/index.ts`

### ☐ 1.3 Remove deprecated prompt constant exports
- [ ] In `backend/lib/core/prompts/generation-prompt.ts`: remove `GENERATION_SYSTEM_PROMPT` constant
- [ ] In `backend/lib/diff/prompts/modification-prompt.ts`: remove `CORE_MODIFICATION_PROMPT` constant
- [ ] These are built at module load time wasting CPU on startup

### ☐ 1.4 Delete dead env-schema.ts
- [ ] Delete `shared/src/config/env-schema.ts`
- [ ] Remove `export * from './config/env-schema'` from `shared/src/index.ts`

---

## Group 2: Infrastructure Cleanup

### ☐ 2.1 Remove `swcMinify` from next.config.js
- [ ] Deprecated in Next.js 13+ (SWC is now default). Remove to eliminate deprecation warning.

### ☐ 2.2 Remove unused backend dependencies
In `backend/package.json`:
- [ ] Remove `fast-check` (zero imports found)
- [ ] Remove `@types/uuid` (uuid v9 includes own types)

### ☐ 2.3 Move `@types/react-syntax-highlighter` to devDependencies
- [ ] In `frontend/package.json`, move from `dependencies` to `devDependencies`.

### ☐ 2.4 Add explicit `zod` dependency to frontend
- [ ] Add `"zod": "^4.3.6"` to `frontend/package.json` (frontend/src/config.ts imports zod but it's only resolved via workspace symlink)

---

## Group 3: Correctness Bugs (Stale Closures)

### ☐ 3.1 Fix reportError stale closure on repairPhase
**File:** `frontend/src/context/PreviewErrorContext.tsx:84`

- [ ] `reportError` closes over `repairPhase` state — reads stale value during transitions.

**Fix:** Use a ref:
```typescript
const repairPhaseRef = useRef<RepairPhase>('idle');
useEffect(() => { repairPhaseRef.current = repairPhase; }, [repairPhase]);

const reportError = useCallback((error: RuntimeError) => {
  if (repairPhaseRef.current === 'idle') {
    setRepairPhase('detecting');
  }
}, []); // stable — no dependency on repairPhase
```

### ☐ 3.2 Fix completeAutoRepair stale repairAttempts
**File:** `frontend/src/context/PreviewErrorContext.tsx:163`

- [ ] `completeAutoRepair` closes over `repairAttempts` — check `repairAttempts >= MAX_REPAIR_ATTEMPTS` reads stale value.

**Fix:** Mirror with ref:
```typescript
const repairAttemptsRef = useRef(0);
useEffect(() => { repairAttemptsRef.current = repairAttempts; }, [repairAttempts]);

const completeAutoRepair = useCallback((success: boolean) => {
  if (repairAttemptsRef.current >= MAX_REPAIR_ATTEMPTS) {
    setRepairPhase('failed');
  } else {
    setRepairPhase('detecting');
  }
}, []);
```

### ☐ 3.3 Fix RepairStatus setTimeout without cleanup
**File:** `frontend/src/components/RepairStatus/RepairStatus.tsx:51`

- [ ] `handleExit` creates a setTimeout that fires after unmount.

**Fix:** Store timer in ref, clean up on unmount:
```typescript
const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
useEffect(() => () => { if (exitTimerRef.current) clearTimeout(exitTimerRef.current); }, []);
```

---

## Group 4: Backend Code Quality

### ☐ 4.1 Replace console.log with structured logger in VersionManager
**File:** `backend/lib/core/version-manager.ts:104, 134, 295`

- [ ] Three `console.log` calls bypass LOG_LEVEL filtering and request correlation. Replace with `createLogger('version-manager')`.

### ☐ 4.2 Fix worker task ID collision
**File:** `backend/lib/core/worker-pool.ts:75`

- [ ] `Math.random().toString(36).substring(7)` produces ~3-4 chars. Replace with `crypto.randomUUID()`.

### ☐ 4.3 Track workerToTaskId to reject tasks on worker error
**File:** `backend/lib/core/worker-pool.ts:43-51`

- [ ] When a worker errors, its in-progress task leaks for 30s. Add `workerToTaskId: Map<number, string>` and reject the task in the error handler.

### ☐ 4.4 Extract shared categorizeError function
**Files:** `backend/lib/ai/gemini-client.ts:486`, `backend/lib/ai/modal-client.ts:399`

- [ ] Near-identical private methods. Extract to `backend/lib/ai/ai-error-utils.ts` and import in both clients.

### ☐ 4.5 Fix misleading loop condition in modification-engine
**File:** `backend/lib/diff/modification-engine.ts:200`

- [ ] `while (attempt <= MAX_RETRIES)` runs MAX_RETRIES+1 times. Rename to MAX_ATTEMPTS or fix the loop bounds to match semantics.

---

## Group 5: Backend Performance

### ☐ 5.1 Pre-compute normalizedFiles Set in BuildValidator
**File:** `backend/lib/core/build-validator.ts:156`

- [ ] `resolveRelativeImport` calls `allFiles.map(f => normalizePath(f))` on EVERY import (O(files × imports × files)).
- [ ] Compute `normalizedFilesSet = new Set(allFiles.map(normalizePath))` once before the loop. Change `includes()` to `Set.has()` for O(1) lookups.

### ☐ 5.2 Eliminate double cache key computation in FilePlanner
**File:** `backend/lib/analysis/file-planner/file-planner.ts:80-85`

- [ ] `getCachedChunkIndex` and `wasFromCache` both compute `getProjectStateCacheKey`. Return `{ index, fromCache }` from `getCachedChunkIndex`, delete `wasFromCache`.

### ☐ 5.3 Pre-compile regexes in FallbackSelector.scoreByContent
**File:** `backend/lib/analysis/file-planner/fallback-selector.ts:226-243`

- [ ] Creates `new RegExp` per word per file. Pre-compile a `Map<string, RegExp>` before the file loop.

### ☐ 5.4 Pass pre-split lines to parseImports and getExportedSymbols
**File:** `backend/lib/analysis/file-planner/chunk-index.ts:191, 244`

- [ ] Both methods split content into lines when their caller already has `lines`. Change signatures to accept `lines: string[]`.

### ☐ 5.5 Linear scan for getLatestVersion
**File:** `backend/lib/core/version-manager.ts:240-243`

- [ ] Replace `getAllVersions()` (O(n log n) sort) with O(n) linear scan for max timestamp.

### ☐ 5.6 Fix evictOldestVersions to use Map insertion order
**File:** `backend/lib/core/version-manager.ts:92-108`

- [ ] Since versions are inserted chronologically and Map preserves order, delete the first N keys instead of sorting.

### ☐ 5.7 Cache getProviderPromptConfig at module level
**File:** `backend/lib/core/prompts/provider-prompt-config.ts:20`

- [ ] `AI_PROVIDER` doesn't change at runtime. Compute once at module load.

### ☐ 5.8 Minify responseSchema in modal-client
**File:** `backend/lib/ai/modal-client.ts:371`

- [ ] Change `JSON.stringify(schema, null, 2)` to `JSON.stringify(schema)` — saves tokens per request.

---

## Group 6: Frontend Code Quality

### ☐ 6.1 Wire EditableProjectName or remove disabled={true}
**File:** `frontend/src/components/AppLayout/AppLayout.tsx:193`

- [ ] Hardcoded `disabled={true}` makes the component a no-op. Wire to `ProjectContext.renameProject` with `disabled={isLoading}`.

### ☐ 6.2 Consolidate ErrorType definitions
**Files:** `frontend/src/utils/error-messages.ts:5`, `frontend/src/components/ErrorMessage/ErrorMessage.tsx:7`

- [ ] Two incompatible `ErrorType` unions. Merge into one in `error-messages.ts`, import in ErrorMessage.

### ☐ 6.3 Rename shadowed userMessage variable
**File:** `frontend/src/hooks/useSubmitPrompt.ts:134`

- [ ] Local error string `userMessage` shadows the chat message object at line 67. Rename to `errorText`.

### ☐ 6.4 Fix `any` types
- [ ] `MarkdownRenderer.tsx:27` — type code component props properly
- [ ] `StorageService.ts` — catch blocks: `unknown` + narrowing
- [ ] `GenerationContext.tsx` — replace `any` with actual response types

### ☐ 6.5 Fix timeout error message mismatch
**File:** `frontend/src/context/GenerationContext.tsx:261`

- [ ] Hardcoded "60 seconds" but config is 65s. Use `Math.round(appConfig.api.timeout / 1000)`.

---

## Group 7: Frontend Performance

### ☐ 7.1 Memoize MarkdownRenderer components object
**File:** `frontend/src/components/MarkdownRenderer/MarkdownRenderer.tsx:26`

- [ ] Components object recreated every render → ReactMarkdown remounts code blocks. Extract to module level or `useMemo`.

### ☐ 7.2 Sample file content in analyzeProjectForSuggestions
**File:** `frontend/src/data/prompt-suggestions.ts:194`

- [ ] `Object.values(files).join('\n')` concatenates ALL content. Sample up to 10 files × 2000 chars.

### ☐ 7.3 Fix useAutoSave to debounce on meaningful changes only
**File:** `frontend/src/hooks/useAutoSave.ts:105`

- [ ] Depend on `projectState?.id` and `messages.length` (stable primitives) instead of full objects.

### ☐ 7.4 Extract stable callbacks in ChatInterface message list
**File:** `frontend/src/components/ChatInterface/ChatInterface.tsx:224, 239`

- [ ] Inline `onToggle={() => toggle(id)}` defeats memoization. Pass `messageId` prop and call `toggle` internally.

### ☐ 7.5 Extract QuickActions static data to module level
**File:** `frontend/src/components/QuickActions/QuickActions.tsx:33`

- [ ] Four action objects with JSX recreated per render. Move to module scope.

### ☐ 7.6 Metadata-only update for StorageService.renameProject
**File:** `frontend/src/services/storage/StorageService.ts:529`

- [ ] Currently loads full project to rename. Use targeted IndexedDB get-and-put of only the record.

### ☐ 7.7 Stabilize useKeyboardShortcuts listener
**File:** `frontend/src/hooks/useKeyboardShortcuts.ts:17`

- [ ] Destructure individual handlers and depend on them instead of the `handlers` object.

### ☐ 7.8 Split ProjectContext into state/actions
**File:** `frontend/src/context/ProjectContext.tsx`

- [ ] Follow the established split context pattern (see GenerationContext). Create `ProjectStateContext` and `ProjectActionsContext` so action-only consumers don't re-render on state changes.

---

## Verification

After implementation, verify by:
- [ ] `npm run build` in both frontend and backend — no compile errors
- [ ] Run the app end-to-end: create a project, modify it, trigger auto-repair
- [ ] Check browser DevTools for reduced re-render counts (React Profiler)
- [ ] Verify no console warnings about unmounted component setState
- [ ] Confirm dead code files are gone: `git diff --stat` shows deletions
