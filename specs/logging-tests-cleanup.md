# Logging, Unit Tests & Unused Code Cleanup

> Improve observability, test coverage, and codebase hygiene across the entire project.

---

## Current State Assessment

### Logging

| Area | Status | Details |
|------|--------|---------|
| Backend Logger | ✅ Solid | `lib/logger.ts` — structured, leveled (debug/info/warn/error), request ID correlation, ISO timestamps |
| Backend Metrics | ✅ Solid | `lib/metrics.ts` — `OperationTimer`, token tracking, formatted output |
| Frontend Logging | ❌ None | 12+ files use raw `console.error()`, 1 uses `console.log()`, 1 uses `console.warn()` — no abstraction, no levels, no correlation |

### Unit Tests

| Package | Test Files | Coverage Gaps |
|---------|-----------|---------------|
| **Backend** | 32 test files | Good coverage of core, diff, analysis, AI, API |
| **Frontend** | 7 test files | Most components, contexts, hooks, and services untested |
| **Shared** | 1 test file | Minimal coverage |
| **Frontend `test/` dir** | Empty | Setup exists but no tests |

### Unused Code & Files

| Item | Location | Issue |
|------|----------|-------|
| `prompt-enhancer/` | `backend/lib/prompt-enhancer/` | Empty directory, unreferenced |
| `modify-stream/` | `backend/app/api/modify-stream/` | Empty directory |
| `frontend/src/test/` | `frontend/src/test/` | Empty directory |
| `hooks/index.ts` | `frontend/src/hooks/index.ts` | Missing exports: `useAutoSave`, `useSubmitPrompt` |
| `@/hooks` barrel | Frontend-wide | Never imported — direct imports used instead |
| `@/components` barrel | Frontend-wide | Only 3 files import from it; most use direct paths |

---

## Phase 1: Frontend Logging Service

### Task 1.1: Create Frontend Logger

**Files:** `frontend/src/utils/logger.ts` [NEW]

Create a lightweight client-side logger matching the backend's interface:

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface FrontendLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}
```

Requirements:
- Configurable via `VITE_LOG_LEVEL` environment variable (default: `warn` in production, `debug` in development)
- Structured output with `[timestamp] [LEVEL] [module] message`
- `createLogger(name)` factory (same pattern as backend)
- In production: suppress debug/info, only warn/error
- Optional: buffer errors for future remote reporting

### Task 1.2: Replace Raw Console Calls

**Files:** Multiple frontend files (12+ files)

Replace all raw `console.log`, `console.error`, `console.warn` calls with the new logger:

| File | Current Usage | Replacement |
|------|--------------|-------------|
| `App.tsx` | `console.error` | `createLogger('App')` |
| `BuilderPage.tsx` | `console.error` | `createLogger('BuilderPage')` |
| `AppLayout.tsx` | `console.log`, `console.error` | `createLogger('AppLayout')` |
| `config.ts` | `console.error` | `createLogger('Config')` |
| `useSubmitPrompt.ts` | `console.error` | `createLogger('SubmitPrompt')` |
| `useAutoSave.ts` | `console.error` | `createLogger('AutoSave')` |
| `GenerationContext.tsx` | `console.error` | `createLogger('Generation')` |
| `PreviewErrorContext.tsx` | `console.error` | `createLogger('PreviewError')` |
| `StorageService.ts` | `console.error` | `createLogger('Storage')` |
| `PreviewErrorBoundary.tsx` | `console.error` | `createLogger('PreviewErrorBoundary')` |
| `ErrorBoundary.tsx` | `console.error` | `createLogger('ErrorBoundary')` |
| `ExportButton.tsx` | `console.error` | `createLogger('ExportButton')` |
| `client.ts` | `console.warn` | `createLogger('Backend')` |

---

## Phase 2: Unit Test Expansion

### Task 2.1: Frontend Test Infrastructure

**Files:**
- `frontend/vitest.config.ts` [NEW] — if not present
- `frontend/src/test/setup.ts` [NEW] — test setup with mocks for localStorage, matchMedia, etc.

Setup:
- Vitest + React Testing Library + jsdom environment
- Mock IndexedDB for storage tests
- Mock `matchMedia` for theme tests
- Coverage reporting configured

### Task 2.2: Frontend Component Tests (High Priority)

| Component | File [NEW] | Test Cases |
|-----------|-----------|------------|
| `ThemeToggle` | `ThemeToggle/__tests__/ThemeToggle.test.tsx` | Renders, toggles theme, persists to localStorage, respects system preference |
| `ProjectGallery` | `ProjectGallery/__tests__/ProjectGallery.test.tsx` | Renders projects, search filtering, sort, empty state, loading skeleton, delete flow |
| `TemplateGrid` | `TemplateGrid/__tests__/TemplateGrid.test.tsx` | Renders templates, category filtering, search, empty state |
| `WelcomePage` | `pages/__tests__/WelcomePage.test.tsx` | Renders hero, shows projects, prompt input, template selection |
| `ExportButton` | `ExportButton/__tests__/ExportButton.test.tsx` | Export trigger, error handling |

### Task 2.3: Frontend Hook Tests (High Priority)

| Hook | File [NEW] | Test Cases |
|------|-----------|------------|
| `useAutoSave` | Already has `__tests__` dir | Debounce save, error handling, IndexedDB writes |
| `useErrorMonitor` | `hooks/__tests__/useErrorMonitor.test.ts` | Error detection, threshold, debounce |
| `useKeyboardShortcuts` | `hooks/__tests__/useKeyboardShortcuts.test.ts` | Ctrl+Enter, Escape, etc. |

### Task 2.4: Frontend Service Tests

| Service | File [NEW] | Test Cases |
|---------|-----------|------------|
| `StorageService` | `services/storage/__tests__/StorageService.test.ts` | CRUD operations, migration, error handling |

### Task 2.5: Frontend Context Tests

| Context | File [NEW] | Test Cases |
|---------|-----------|------------|
| `ProjectContext` | `context/__tests__/ProjectContext.test.tsx` | State updates, project CRUD |
| `VersionContext` | `context/__tests__/VersionContext.test.tsx` | Version tracking, undo/redo |
| `AutoRepairContext` | `context/__tests__/AutoRepairContext.test.tsx` | Auto-repair flow |
| `ChatMessagesContext` | `context/__tests__/ChatMessagesContext.test.tsx` | Message state management |

### Task 2.6: Shared Package Tests

| Module | File [NEW] | Test Cases |
|--------|-----------|------------|
| Types & Validators | `shared/src/__tests__/types.test.ts` | Schema validation, edge cases |
| Config | `shared/src/__tests__/config.test.ts` | Config defaults, overrides |

### Task 2.7: Backend Test Gaps

| Module | File [NEW] | Test Cases |
|--------|-----------|------------|
| API routes (modify-stream) | `app/api/__tests__/modify-stream.test.ts` | Streaming modify endpoint |
| Prompt enhancer | If implemented — tests needed |

---

## Phase 3: Unused Code & File Cleanup

### Task 3.1: Remove Empty Directories

| Path | Action |
|------|--------|
| `backend/lib/prompt-enhancer/` | Delete — empty, unreferenced |
| `backend/app/api/modify-stream/` | Delete if empty, or implement |
| `frontend/src/test/` | Repurpose for test setup (Task 2.1) or delete |

### Task 3.2: Fix Barrel Exports

**File:** `frontend/src/hooks/index.ts`
- Add missing exports for `useAutoSave` and `useSubmitPrompt`
- Or remove the barrel file entirely if direct imports are preferred

**File:** `frontend/src/components/index.ts`
- Decide: either add WelcomePage-related components (ProjectGallery, TemplateGrid, ThemeToggle) or document that these use direct imports intentionally

### Task 3.3: Audit Dead Exports

Run a tool pass (e.g., `ts-prune` or `knip`) to find:
- Exported functions/types never imported anywhere
- Unused dependencies in `package.json`
- Circular dependency detection

Recommended tool:
```bash
npx knip --reporter compact
```

### Task 3.4: Audit CSS Dead Code

Check for unused CSS classes across:
- `frontend/src/index.css`
- `frontend/src/App.css`
- `frontend/src/styles/ui.css`
- All component CSS files

Recommended: Use PurgeCSS or manual audit with search.

---

## Priority Order

| Priority | Phase | Effort | Impact |
|----------|-------|--------|--------|
| 🔴 High | 1.1 Frontend Logger | ~1hr | Immediate observability improvement |
| 🔴 High | 1.2 Replace Console Calls | ~1hr | Consistent logging across frontend |
| 🟡 Medium | 2.1 Test Infrastructure | ~30min | Enables all frontend tests |
| 🟡 Medium | 2.2 Component Tests | ~3hrs | Covers most user-facing code |
| 🟡 Medium | 2.3–2.5 Hook/Service/Context Tests | ~3hrs | Covers business logic |
| 🟢 Low | 3.1 Remove Empty Dirs | ~5min | Clean project structure |
| 🟢 Low | 3.2 Fix Barrel Exports | ~15min | Cleaner imports |
| 🟢 Low | 3.3–3.4 Dead Code Audit | ~1hr | Reduced bundle size |

---

## Verification

- [x] All `console.*` calls in frontend replaced with logger
- [x] Frontend tests pass: `npx vitest run`
- [x] Backend tests pass: `npx vitest run`
- [x] No empty directories remain
- [x] Barrel exports are consistent
- [x] `knip` reports reviewed - unused exports removed
- [ ] Coverage target: >60% for frontend, maintain >80% for backend
