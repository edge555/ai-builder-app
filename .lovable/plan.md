
# Lovable-Style Code Generation and Auto-Repair System

## Executive Summary

This plan outlines how to transform your AI App Builder into a Lovable-like system that generates correct code consistently and efficiently auto-repairs when issues occur. The goal is to achieve high success rates through multi-layered validation, intelligent retry mechanisms, and runtime feedback integration.

## Current State Analysis

Your system already has foundational auto-repair capabilities:

**Existing Strengths:**
- Build validation with up to 2 retries (missing dependencies, broken imports)
- Syntax validation (bracket matching, unclosed strings)
- Styling baseline validation with repair prompts
- Search/replace edit retry mechanism (3 attempts for modify)
- Failure classification (APPLY_FAILED, SYNTAX_FAILED, INTEGRITY_FAILED)
- TypeScript basic syntax checking

**Current Gaps:**
1. No runtime error feedback loop (preview crashes not captured)
2. Limited TypeScript type checking (only bracket/string validation)
3. No incremental repair (full regeneration on failures)
4. Missing sandbox execution testing
5. No learning from repeated failures
6. Single-pass generation (no iterative refinement)

---

## Proposed Architecture

```text
+------------------+     +-------------------+     +------------------+
|   User Prompt    | --> | Intent Analysis   | --> | Code Generation  |
+------------------+     +-------------------+     +------------------+
                                                           |
                                                           v
+------------------+     +-------------------+     +------------------+
| Runtime Testing  | <-- | Build Validation  | <-- | Syntax Check     |
+------------------+     +-------------------+     +------------------+
        |                        |                        |
        v                        v                        v
+------------------+     +-------------------+     +------------------+
| Error Capture    | --> | AI Error Analysis | --> | Targeted Repair  |
+------------------+     +-------------------+     +------------------+
        |                        |                        |
        +------------------------+------------------------+
                                 |
                                 v
                    +-------------------------+
                    | Validation Gate (Pass?) |
                    +-------------------------+
                         |            |
                      Yes|            |No (retry up to N)
                         v            v
                    +--------+  +-------------+
                    | Return |  | Repair Loop |
                    +--------+  +-------------+
```

---

## Implementation Plan

### Phase 1: Enhanced Validation Pipeline (Foundation)

#### 1.1 Real TypeScript Type Checking

Replace basic bracket validation with actual TypeScript compiler analysis.

**File:** `supabase/functions/generate/index.ts` and `supabase/functions/modify/index.ts`

Add a function that performs real TypeScript type checking using the TypeScript compiler API:

```text
function validateTypeScript(files: Record<string, string>): {
  valid: boolean;
  errors: Array<{
    file: string;
    line: number;
    message: string;
    code: number;
  }>;
}
```

This will:
- Create an in-memory TypeScript program from the files
- Run the type checker to find type errors
- Return structured errors with file paths and line numbers
- Catch issues like undefined variables, type mismatches, missing props

#### 1.2 Dependency Resolution Validation

Enhance the existing import validation to be more comprehensive:

- Check all npm package versions are compatible
- Validate React component prop types match usage
- Detect circular dependencies
- Check for duplicate package installations

### Phase 2: Intelligent Retry System

#### 2.1 Error Classification and Routing

Create a smart error router that determines the best repair strategy:

```text
ErrorType        | Repair Strategy           | Max Retries
-----------------|---------------------------|------------
SYNTAX_ERROR     | Targeted fix with context | 3
TYPE_ERROR       | Type-aware regeneration   | 2
IMPORT_ERROR     | Add dependency or fix path| 3
RUNTIME_ERROR    | Full context repair       | 2
LOGIC_ERROR      | User feedback required    | 1
```

**File:** Create new error routing logic in the edge functions

#### 2.2 Incremental Repair (Not Full Regeneration)

Instead of regenerating the entire project when errors occur:

1. Identify the minimal set of files that need fixing
2. Send only relevant context to the AI
3. Apply targeted edits to fix specific errors
4. Validate only the changed portions first

This is more efficient and preserves working code.

#### 2.3 Cascading Repair Attempts

Implement a repair cascade with increasing scope:

```text
Attempt 1: Minimal fix (single file, single edit)
Attempt 2: Related files fix (file + its dependencies)  
Attempt 3: Component-level regeneration
Attempt 4: Full feature regeneration
```

### Phase 3: Runtime Feedback Integration

#### 3.1 Preview Error Capture

Add a mechanism to capture runtime errors from the preview:

**Frontend Changes (`src/context/ChatContext.tsx`):**
- Add error boundary around the preview
- Capture console.error messages
- Detect React rendering failures
- Track unhandled promise rejections

**Edge Function Enhancement:**
- Accept runtime errors as input to modify endpoint
- Include runtime context in repair prompts

#### 3.2 Automatic Retry on Preview Failure

When the preview fails to render:

1. Capture the error message and stack trace
2. Identify the failing component/file
3. Send error context to AI for repair
4. Apply fix and revalidate
5. Report back to user only after success or max retries

**New Flow in `ChatContext.tsx`:**

```text
submitPrompt() ->
  generateProject() ->
    if (success) ->
      waitForPreviewRender() ->
        if (renderError) ->
          autoRepair(error) ->
            retry up to 2 times
```

### Phase 4: Improved Prompting Strategy

#### 4.1 Error-Aware System Prompts

Enhance the system prompts with error prevention rules:

```text
Common Error Prevention Rules:
1. Always check if a variable exists before using it
2. Always provide fallback values for optional props
3. Use type guards before accessing nested properties
4. Import all dependencies before using them
5. Match export/import names exactly
```

#### 4.2 Code Pattern Library

Build a library of proven patterns that the AI should use:

- React component structure templates
- State management patterns
- Error boundary implementations
- API call patterns with proper error handling

Store these in the system prompt or as few-shot examples.

#### 4.3 Staged Generation

For complex requests, break generation into stages:

```text
Stage 1: Core structure (types, interfaces, skeleton)
Stage 2: Component logic (state, hooks, handlers)
Stage 3: UI rendering (JSX, styling)
Stage 4: Integration (imports, exports, wiring)
```

Validate after each stage before proceeding.

### Phase 5: Smart Caching and Learning

#### 5.1 Error Pattern Cache

Track common error patterns and their fixes:

```text
{
  errorPattern: "Cannot find module './ComponentName'",
  fix: "Check if file exists, suggest creation or correct path",
  successRate: 0.95
}
```

Use this to suggest fixes before asking AI.

#### 5.2 Project-Specific Context

Maintain awareness of project patterns:

- Component naming conventions used
- Import path structures
- State management approach
- Styling method (CSS modules, plain CSS, etc.)

---

## Technical Implementation Details

### File Changes Required

| File | Changes |
|------|---------|
| `supabase/functions/generate/index.ts` | Add TypeScript validation, enhanced retry logic, runtime error handling |
| `supabase/functions/modify/index.ts` | Add incremental repair, error classification, cascading retries |
| `src/context/ChatContext.tsx` | Add preview error detection, auto-retry flow |
| `src/components/PreviewPanel/PreviewPanel.tsx` | Add error boundary, error reporting |
| `supabase/functions/shared/ts-validator.ts` (new) | TypeScript compiler validation utilities |
| `supabase/functions/shared/repair-strategies.ts` (new) | Repair routing and strategy selection |

### New Error Boundary Component

Create an error boundary that captures and reports preview failures:

```text
PreviewErrorBoundary
├── Captures React rendering errors
├── Reports error + component stack to parent
├── Shows user-friendly error UI
└── Triggers auto-repair flow
```

### Enhanced Validation Order

```text
1. JSON Structure Check (existing)
2. File Path Validation (existing)
3. TypeScript Parsing + Type Check (new)
4. Import Resolution (enhanced)
5. Dependency Check (existing)
6. Forbidden Patterns (existing)
7. Architecture Check (existing)
8. Sandbox Render Test (new)
```

---

## Repair Prompt Templates

### For Syntax Errors:
```text
The following TypeScript syntax error was detected:
File: {filePath}
Line: {lineNumber}
Error: {errorMessage}

Fix this specific syntax error while preserving the intended functionality.
Return only the corrected code for this file.
```

### For Type Errors:
```text
The TypeScript compiler found this type error:
File: {filePath}
Error: {errorMessage}
Context: {surroundingCode}

Fix the type error by either:
1. Correcting the type annotation
2. Adding a type guard
3. Fixing the value to match the expected type
```

### For Runtime Errors:
```text
The application crashed with this runtime error:
Error: {errorMessage}
Stack trace: {stackTrace}
Component: {componentName}

The error occurred when: {userAction}

Fix this runtime error. Common causes:
- Accessing undefined properties
- Missing error handling
- Incorrect state initialization
```

---

## Success Metrics

Track these metrics to measure improvement:

1. **First-Pass Success Rate**: % of generations that work without repair
2. **Total Success Rate**: % that succeed after all retries
3. **Average Retries**: Mean number of repair attempts needed
4. **Time to Success**: Average time from prompt to working preview
5. **Error Categories**: Distribution of error types encountered

---

## Implementation Priority

**Immediate (High Impact, Lower Effort):**
1. Enhanced error messages in repair prompts
2. Incremental repair (don't regenerate everything)
3. Better failure context to AI

**Short-term (High Impact, Medium Effort):**
4. Runtime error capture from preview
5. Auto-retry on preview failure
6. TypeScript type checking validation

**Medium-term (Medium Impact, Higher Effort):**
7. Error pattern caching
8. Staged generation for complex requests
9. Project-specific context awareness

---

## Summary

The key improvements to make your system more Lovable-like:

1. **Multi-layer validation**: Catch errors at syntax, type, build, and runtime levels
2. **Intelligent retries**: Route errors to the right repair strategy
3. **Incremental fixes**: Fix only what's broken, preserve what works
4. **Runtime feedback**: Capture and fix preview crashes automatically
5. **Better prompting**: Prevent errors through better instructions
6. **Learn from failures**: Cache error patterns and successful fixes

This approach prioritizes efficiency by attempting minimal fixes first and only escalating to larger repairs when necessary, reducing both AI costs and user wait time.
