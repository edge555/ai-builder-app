# Maintainability Improvement Plan

> **Project**: AI App Builder (Monorepo)  
> **Focus**: Naming, comments, complexity reduction, dead code removal  
> **Scope**: Small-scale, no backward compatibility concerns  
> **Last Updated**: 2026-03-03

---

## Overview

This plan focuses on **code-level maintainability improvements** to make the codebase easier to understand, modify, and debug. Unlike tooling-focused plans, this addresses the actual source code quality.

**Current Observations**:
- Good JSDoc practices already exist at file/class level
- Some large files (>500 lines) with multiple responsibilities
- Magic numbers scattered throughout
- Inconsistent error message formats
- Some deeply nested conditionals

---

## Phase 1: Naming Conventions & Consistency

*Focus: Make code self-documenting through clear naming*

### Task 1.1: Standardize Boolean Variable Naming
**Status**: [ ] Pending

- [ ] Rename boolean variables to use `is`, `has`, `should`, `can` prefixes
  - `fromCache` → `isFromCache`
  - `skipPlanning` → `shouldSkipPlanning`
  - `includeDesignSystem` → `shouldIncludeDesignSystem`
- [ ] Search pattern: `\b(private |readonly )?(\w+)(Cache|Flag|Enabled|Disabled|Skip|Include)\b`
- [ ] Update in: `backend/lib/**/*.ts`, `frontend/src/**/*.ts`

**Example**:
```typescript
// Before
const fromCache = this.cache.has(key);

// After
const isFromCache = this.cache.has(key);
```

---

### Task 1.2: Rename Ambiguous Abbreviations
**Status**: [ ] Pending

- [ ] Replace single-letter and unclear abbreviations:
  - `e` → `error` (in catch blocks)
  - `err` → `error`
  - `res` → `response`
  - `req` → `request`
  - `ctx` → `context`
  - `opts` → `options`
  - `cfg` → `config`
- [ ] Keep widely accepted: `id`, `url`, `api`, `src`, `dest`

**Search patterns**:
```regexcatch \((\w+)\)  // Find single-letter catch params
\bconst (\w{1,3}) = await  // Find short variable names
```

---

### Task 1.3: Standardize Handler/Callback Naming
**Status**: [ ] Pending

- [ ] Use `handle` prefix for event handlers: `handleClick`, `handleSubmit`
- [ ] Use `on` prefix for callback props: `onChange`, `onComplete`
- [ ] Use `get` prefix for computed values: `getCacheKey`, `getFileMetadata`
- [ ] Use `create` prefix for factories: `createLogger`, `createAIProvider`
- [ ] Use `is` prefix for type guards: `isRetryableError`, `isValidPath`

---

## Phase 2: Reduce Code Complexity

*Focus: Make functions shorter and less nested*

### Task 2.1: Extract Long Functions (>50 lines)
**Status**: [x] Pending

- [x] Identify functions exceeding 50 lines:
  ```bash
  npx eslint . --rule 'max-lines-per-function: [error, 50]'
  ```
- [x] Refactor by extracting logical steps into private methods

**Targets** (large files to review):
- `backend/lib/analysis/file-planner/file-planner.ts` (~540 lines)
- `backend/lib/diff/modification-engine.ts` (~600 lines)
- `backend/lib/ai/modal-client.ts` (~400 lines)
- `backend/lib/ai/openrouter-client.ts` (~400 lines)

**Example refactoring pattern**:
```typescript
// Before: One long method
async modifyProject(projectState, prompt, options) {
  // 20 lines validation
  // 30 lines slice selection
  // 40 lines modification generation
  // 25 lines result processing
}

// After: Composed of smaller methods
async modifyProject(projectState, prompt, options) {
  this.validateInput(projectState, prompt);
  const slices = await this.selectRelevantSlices(projectState, prompt);
  const modifications = await this.generateModifications(slices);
  return this.processResults(modifications);
}
```

---

### Task 2.2: Reduce Nesting Depth
**Status**: [x] Completed

- [x] Identify deeply nested code (>3 levels):
  ```bash
  npx eslint . --rule 'max-depth: [warn, 3]'
  ```
- [x] Apply early return pattern (guard clauses)
- [x] Extract nested conditionals into named variables

**Example**:
```typescript
// Before (4 levels deep)
if (provider) {
  if (isAvailable) {
    if (hasQuota) {
      if (!isRateLimited) {
        return await callProvider();
      }
    }
  }
}

// After (early returns)
if (!provider) return null;
if (!isAvailable) return null;
if (!hasQuota) throw new QuotaError();
if (isRateLimited) throw new RateLimitError();
return await callProvider();
```

**Changes Made**:
| File | Before | After | Method |
|------|--------|-------|--------|
| [`backend/lib/ai/modal-client.ts`](backend/lib/ai/modal-client.ts) | 5 levels (while→for→if→try→if) in `processSSEStream` | 2 levels | Extracted `parseSSEToken()` helper with early returns |
| [`backend/lib/ai/openrouter-client.ts`](backend/lib/ai/openrouter-client.ts) | 6 levels (while→for→if→if→try→if) in `processSSEStream` | 2 levels | Extracted `parseSSEDelta()` helper with early returns |
| [`backend/lib/diff/modification-engine.ts`](backend/lib/diff/modification-engine.ts) | 4 levels (try→for→if→if) in `parseBuildFixAndApply` | 2 levels | Extracted `applyBuildFix()` helper with early return |

---

### Task 2.3: Simplify Complex Conditionals
**Status**: [x] Completed

- [x] Extract complex conditions into named boolean variables
- [x] Replace conditional chains with lookup objects/maps

**Example**:
```typescript
// Before
if (category === 'ui' || category === 'style' || category === 'mixed') {
  includeDesignSystem = true;
}

// After
const DESIGN_RELATED_CATEGORIES = ['ui', 'style', 'mixed'] as const;
const shouldIncludeDesignSystem = DESIGN_RELATED_CATEGORIES.includes(category);
```

**Changes Made**:
| File | Before | After |
|------|--------|-------|
| [`backend/lib/diff/modification-engine.ts`](backend/lib/diff/modification-engine.ts) | `category === 'ui' \|\| ...` (3-part OR) | `DESIGN_SYSTEM_CATEGORIES.has(category)` (module-level `Set`) |
| [`backend/lib/core/build-validator.ts`](backend/lib/core/build-validator.ts) | 6-part `.endsWith()` OR chain | `ASSET_EXTENSIONS.some(ext => importPath.endsWith(ext))` (named array constant) |
| [`backend/lib/core/build-validator.ts`](backend/lib/core/build-validator.ts) | `if/else if` chain for 5 packages | `PACKAGE_SUGGESTIONS[packageName] ?? default` (lookup object) |
| [`backend/lib/analysis/file-planner/file-planner.ts`](backend/lib/analysis/file-planner/file-planner.ts) | 5-part OR with separate `.match()` calls | `isTopLevelDeclaration` named boolean + consolidated regex |

---

## Phase 3: Magic Numbers & Constants

*Focus: Make values meaningful and configurable*

### Task 3.1: Extract Magic Numbers to Named Constants
**Status**: [x] Completed

- [x] Search for magic numbers in codebase:
  ```regex
  \b\d{3,}\b  // Numbers with 3+ digits
  \b60\b      // Common timeouts
  \b1000\b    // Seconds to ms
  ```

**Changes Made**:
- Added `DEFAULT_API_MAX_RETRIES`, `DEFAULT_RETRY_BASE_DELAY_MS`, `ERROR_TEXT_MAX_LENGTH` to [`backend/lib/constants.ts`](backend/lib/constants.ts)
- Updated [`backend/lib/config.ts`](backend/lib/config.ts) to use `DEFAULT_API_MAX_RETRIES` and `DEFAULT_RETRY_BASE_DELAY_MS` instead of `3` and `1000`
- Removed duplicate `CHARS_PER_TOKEN = 4` from [`backend/lib/analysis/file-planner/metadata-generator.ts`](backend/lib/analysis/file-planner/metadata-generator.ts) — now imports from `constants.ts`
- Added `DEFAULT_MAX_BUFFER_SIZE` (1MB) and `DEFAULT_HIGH_WATER_MARK` (16KB) to [`backend/lib/streaming/backpressure-controller.ts`](backend/lib/streaming/backpressure-controller.ts)
- Replaced `.slice(0, 500)` with `ERROR_TEXT_MAX_LENGTH` in [`backend/lib/ai/modal-client.ts`](backend/lib/ai/modal-client.ts) and [`backend/lib/ai/openrouter-client.ts`](backend/lib/ai/openrouter-client.ts)

---

### Task 3.2: Document Magic Numbers in Comments
**Status**: [x] Completed

For numbers that can't be extracted (one-off calculations):
- [x] Add inline comment explaining the calculation

**Example**:
```typescript
// Before
const delay = Math.pow(2, attempt) * 1000;

// After
// Exponential backoff: 2^attempt seconds (1000ms = 1s)
const delay = Math.pow(2, attempt) * ONE_SECOND_MS;
```

**Changes Made**:
| File | Change |
|------|--------|
| [`backend/lib/ai/modal-client.ts`](backend/lib/ai/modal-client.ts:399) | Added comments explaining exponential backoff (2^attempt) and 30% jitter (0.3) |
| [`backend/lib/ai/openrouter-client.ts`](backend/lib/ai/openrouter-client.ts:399) | Added comments explaining exponential backoff (2^attempt) and 30% jitter (0.3) |
| [`backend/app/api/revert/route.ts`](backend/app/api/revert/route.ts:76) | Added comment explaining ms to seconds conversion (1000ms = 1s) |
| [`backend/app/api/export/route.ts`](backend/app/api/export/route.ts:78) | Added comment explaining ms to seconds conversion (1000ms = 1s) |
| [`backend/app/api/modify/route.ts`](backend/app/api/modify/route.ts:110) | Added comment explaining ms to seconds conversion (1000ms = 1s) |
| [`backend/app/api/diff/route.ts`](backend/app/api/diff/route.ts:120) | Added comment explaining ms to seconds conversion (1000ms = 1s) |
| [`backend/app/api/generate-stream/route.ts`](backend/app/api/generate-stream/route.ts:202) | Fixed hardcoded "120 seconds" to use calculated value from STREAM_TIMEOUT_MS with comment |
| [`backend/lib/core/worker-pool.ts`](backend/lib/core/worker-pool.ts:82) | Added comment explaining 1000ms = 1 second delay |

---

## Phase 4: Documentation & Comments

*Focus: Explain the "why", not just the "what"*

### Task 4.1: Add Inline Comments for Complex Logic
**Status**: [ ] Pending

- [ ] Review functions with high cyclomatic complexity
- [ ] Add comments explaining business logic decisions
- [ ] Comment any workarounds or hacks with TODO/FIXME

**Comment standards**:
```typescript
// Good - explains WHY
// Retry with exponential backoff to avoid thundering herd
await this.delay(Math.pow(2, attempt) * 1000);

// Bad - restates WHAT
// Calculate delay
delay = Math.pow(2, attempt) * 1000;
```

---

### Task 4.2: Document Type Signatures
**Status**: [ ] Pending

- [ ] Add JSDoc to all public function parameters
- [ ] Document return types and possible error conditions
- [ ] Use `@example` for complex functions

**Template**:
```typescript
/**
 * Plans which files to include for modification based on user prompt.
 * 
 * @param prompt - The user's modification request
 * @param projectState - Current project files and metadata
 * @returns Array of code slices containing relevant file content
 * @throws {PlanningError} If AI provider fails and fallback also fails
 * @example
 * const slices = await planner.plan('Add a login button', projectState);
 * // Returns [{ filePath: 'src/App.tsx', content: '...', relevance: 0.95 }]
 */
async plan(prompt: string, projectState: ProjectState): Promise<CodeSlice[]>
```

---

### Task 4.3: Add File-Level Documentation
**Status**: [ ] Pending

- [ ] Ensure every file has a header comment explaining its purpose
- [ ] Add `@module` JSDoc tags
- [ ] Document any external dependencies or requirements

**Template**:
```typescript
/**
 * @module analysis/file-planner
 * @description Orchestrates AI-powered file selection for code modifications.
 * Uses a two-phase approach: planning (AI selects files) and context assembly.
 * 
 * @requires @ai-app-builder/shared - Project state types
 * @requires ai-provider - For making planning requests
 */
```

---

## Phase 5: Dead Code Removal

*Focus: Remove unused exports, functions, and variables*

### Task 5.1: Remove Unused Exports
**Status**: [x] Pending

- [x] Run knip to identify unused exports:
  ```bash
  npx knip --exports
  ```
- [x] Review each flagged export
- [x] Remove confirmed unused exports
- [x] Keep exports used by tests (mark with `/** @public */`)

---

### Task 5.2: Remove Unused Dependencies
**Status**: [x] Completed

- [x] Check for unused npm packages:
  ```bash
  npx knip --dependencies
  ```
- [x] Review and remove confirmed unused packages
- [x] Check both `dependencies` and `devDependencies`

---

### Task 5.3: Clean Up Commented Code
**Status**: [x] Completed

- [x] Search for commented-out code blocks:
  ```regex
  ^\s*//\s*[a-zA-Z]+.*\(\)  // Commented function calls
  ^\s*\/\*[\s\S]*?\*\/      // Block comments
  ```
- [x] Delete stale commented code older than current iteration
- [x] Keep comments explaining why code is disabled (with date/author)

**Changes Made**:
- Removed stale commented-out code from [`frontend/src/services/ErrorAggregator.ts`](frontend/src/services/ErrorAggregator.ts:232) - deleted commented `export const errorAggregator = new ErrorAggregator();` that was superseded by React context pattern

---

### Task 5.4: Remove Unused Type Definitions
**Status**: [x] Completed

- [x] Search for unused interfaces/types:
  ```bash
  npx tsc --noEmit --pretty 2>&1 | grep "is declared but never read"
  npx eslint . --ext .ts 2>&1 | grep "is defined but never used"
  ```
- [x] Remove or export unused types
- [x] Consolidate duplicate type definitions

**Changes Made**:
- Removed unused `ErrorResponse` type import from [`backend/app/api/export/route.ts`](backend/app/api/export/route.ts:10)
- Removed unused `ErrorResponse` type import from [`backend/app/api/generate/route.ts`](backend/app/api/generate/route.ts:10)
- Removed unused `ComponentInfo` and `FunctionInfo` type imports from [`backend/lib/analysis/file-index.ts`](backend/lib/analysis/file-index.ts:15)

---

## Phase 6: Error Handling Standardization

*Focus: Consistent error messages and handling patterns*

### Task 6.1: Standardize Error Messages
**Status**: [ ] Pending

- [ ] Create error message templates:
  - **Input validation**: `"Invalid [field]: [reason]. Expected: [expected]"`
  - **Not found**: `"[Resource] not found: [identifier]"`
  - **Permission**: `"Access denied to [resource]: [reason]"`
  - **External API**: `"[Service] request failed: [error message]"`

**Example**:
```typescript
// Before
throw new Error('File not found');
throw new Error('invalid path');

// After
throw new FileNotFoundError(`File not found: ${filePath}`);
throw new ValidationError(`Invalid path: ${path}. Expected: absolute path within project`);
```

---

### Task 6.2: Create Custom Error Classes
**Status**: [ ] Pending

- [ ] Create `backend/lib/errors/` directory
- [ ] Define base `AppError` class with error codes
- [ ] Create specific error types:
  - `ValidationError`
  - `FileNotFoundError`
  - `AIProviderError`
  - `TimeoutError`
  - `RateLimitError`

**Base class template**:
```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}
```

---

## Phase 7: File Organization

*Focus: Logical grouping and consistent structure*

### Task 7.1: Group Related Functions
**Status**: [ ] Pending

- [ ] Organize file contents in this order:
  1. Imports
  2. Constants/Types
  3. Main class/function
  4. Helper functions (private or exported)
  5. Utility functions

- [ ] Use region comments for large files:
  ```typescript
  // #region Cache Management
  private getCachedChunkIndex() { ... }
  private setCachedChunkIndex() { ... }
  // #endregion
  ```

---

### Task 7.2: Split Large Files (>400 lines)
**Status**: [ ] Pending

Identify and split files with multiple responsibilities:

| File | Lines | Suggested Split |
|------|-------|----------------|
| `file-planner.ts` | ~540 | Extract `ChunkCache`, `SymbolResolver` |
| `modification-engine.ts` | ~600 | Extract `ModificationValidator`, `RetryHandler` |
| `modal-client.ts` | ~400 | Extract `RetryStrategy`, `RequestBuilder` |
| `chunk-index.ts` | ~800 | Already has builder pattern, review for further split |

---

### Task 7.3: Consistent Export Patterns
**Status**: [ ] Pending

- [ ] Use named exports for all public APIs
- [ ] Avoid default exports (harder to search/rename)
- [ ] Group exports at bottom of file:
  ```typescript
  // Export public API
  export { FilePlanner, createFilePlanner };
  export type { FilePlannerOptions, PlanningResult };
  ```

---

## Quick Wins (Do First)

These tasks have high impact with low effort:

1. **[Task 3.1]** Extract magic numbers to constants - makes code immediately more readable
2. **[Task 2.2]** Apply early return pattern - reduces nesting without changing logic
3. **[Task 5.3]** Remove commented-out code - reduces noise
4. **[Task 1.2]** Rename `e/err` to `error` - improves searchability

---

## Implementation Priority

| Phase | Priority | Effort | Impact |
|-------|----------|--------|--------|
| Phase 5: Dead Code Removal | High | Low | High |
| Phase 3: Magic Numbers | High | Low | High |
| Phase 2: Reduce Complexity | High | Medium | High |
| Phase 1: Naming | Medium | Medium | Medium |
| Phase 6: Error Handling | Medium | Medium | Medium |
| Phase 4: Documentation | Low | Medium | Medium |
| Phase 7: File Organization | Low | High | Medium |

---

## Tools to Help

```bash
# Find long functions
npx eslint . --rule 'max-lines-per-function: [error, 50]'

# Find deep nesting
npx eslint . --rule 'max-depth: [warn, 3]'

# Find unused exports/dependencies
npx knip

# Find magic numbers
npx eslint . --rule 'no-magic-numbers: [warn, { ignore: [0, 1, -1] }]'

# Find TODO/FIXME comments
npx eslint . --rule 'no-warning-comments: [warn, { terms: ["todo", "fixme", "hack"] }]'
```

---

## Success Criteria

After completing this plan:
- [ ] No functions over 50 lines (without strong justification)
- [ ] No nesting over 3 levels deep
- [ ] No magic numbers without named constants
- [ ] All public functions have JSDoc
- [ ] No unused exports or dependencies
- [ ] Consistent naming across codebase
- [ ] All errors have descriptive messages
