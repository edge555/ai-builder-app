
# Plan: Lovable-Style Auto-Repair System

## Overview

Transform the current manual auto-repair system into a comprehensive, automatic, multi-layered error detection and self-healing pipeline. The enhanced system will:

1. **Automatically detect** errors from multiple sources (console, bundler, runtime)
2. **Classify and prioritize** errors by severity
3. **Trigger repairs without user action** after brief debounce
4. **Retry with increasing context** if initial repair fails
5. **Provide visual feedback** throughout the repair process
6. **Ensure the project builds** even if it requires multiple API calls

---

## Current Limitations

| Component | Current Behavior | Limitation |
|-----------|-----------------|------------|
| Error Detection | Only catches React render crashes via ErrorBoundary | Misses console errors, build errors, import failures |
| Auto-Repair Trigger | Requires manual button click | Not automatic |
| Error Types | Limited RuntimeErrorType enum | Missing BUILD_ERROR, IMPORT_ERROR, CSS_ERROR |
| Sandpack Integration | No console/bundler monitoring | Errors in preview go undetected |
| Repair Attempts | Max 2, no differentiation | Same approach for all error types |
| User Feedback | Error boundary UI only | No toast/status indicators |

---

## Enhanced Architecture

```text
                    +-----------------------+
                    |    Error Sources      |
                    +-----------------------+
                    |                       |
    +---------------+-------+-------+-------+---------------+
    |               |       |       |       |               |
    v               v       v       v       v               v
+--------+    +---------+  +-----+  +------+  +--------+  +------+
|Console |    |Bundler  |  |React|  |Network|  |TypeScript| |CSS   |
|Errors  |    |Status   |  |Crash|  |Fails  |  |Errors    | |Parse |
+--------+    +---------+  +-----+  +------+  +--------+  +------+
    |               |         |        |           |          |
    +-------+-------+---------+--------+-----------+----------+
            |
            v
    +-------------------+
    | Error Aggregator  |
    | (debounce 800ms)  |
    +-------------------+
            |
            v
    +-------------------+
    | Priority Sorter   |
    | (critical first)  |
    +-------------------+
            |
            v
    +-------------------+
    | Auto-Repair       |
    | Engine            |
    +-------------------+
            |
    +-------+-------+
    |               |
    v               v
 Success         Retry
    |           (max 3)
    v               |
 Clear Error    +---+
                |
                v
            Show Manual
            Intervention UI
```

---

## Implementation Components

### 1. Enhanced Error Types

Expand `src/shared/types/runtime-error.ts` with new error classifications:

| New Error Type | Detection Source | Priority | Auto-Repair Delay |
|----------------|-----------------|----------|-------------------|
| `BUILD_ERROR` | Sandpack bundler status | Critical | Immediate |
| `IMPORT_ERROR` | "Cannot find module" | Critical | Immediate |
| `UNDEFINED_EXPORT` | "does not provide an export" | High | 300ms |
| `CSS_ERROR` | CSS parsing failures | Medium | 500ms |
| `HYDRATION_ERROR` | React hydration mismatches | Medium | 500ms |

### 2. Sandpack Error Listener

New component to capture errors from the Sandpack preview:

**File: `src/components/PreviewPanel/SandpackErrorListener.tsx`**

- Uses `useSandpack()` hook to access bundler status
- Uses `useSandpackConsole()` to capture console.error logs
- Debounces rapid error bursts (800ms)
- Filters known non-critical warnings (React dev warnings, HMR messages)
- Parses stack traces to extract file paths and line numbers
- Reports structured errors to the PreviewErrorContext

### 3. Error Monitor Hook

New hook for comprehensive error monitoring:

**File: `src/hooks/useErrorMonitor.ts`**

| Method | Purpose |
|--------|---------|
| `captureConsoleError(log)` | Parse and queue console errors |
| `captureBundlerError(status)` | Handle bundler failures |
| `debouncedFlush()` | Trigger repair after debounce period |
| `reset()` | Clear error queue on success |

**Error Parsing Logic:**
```text
Input: "TypeError: Cannot read properties of undefined (reading 'map')
        at Header (src/components/Header.tsx:42:15)"

Output: {
  type: 'TYPE_ERROR',
  message: "Cannot read properties of undefined (reading 'map')",
  filePath: 'src/components/Header.tsx',
  line: 42,
  priority: 'high'
}
```

### 4. Error Aggregator Service

New service to combine and prioritize multiple errors:

**File: `src/services/ErrorAggregator.ts`**

- Queues errors as they arrive
- Deduplicates by error signature (message + file + line)
- Sorts by priority (critical > high > medium > low)
- Combines related errors into single repair context
- Provides aggregated error report for AI prompt

**Aggregation Example:**
```text
=== ERROR REPORT ===
Errors Detected: 2

[1] BUILD_ERROR (Critical)
File: src/components/Header.tsx
Message: Module not found: 'react-icons'
Fix: Add to package.json OR use lucide-react (already installed)

[2] TYPE_ERROR (High)  
File: src/components/Header.tsx:42
Message: Cannot read properties of undefined (reading 'map')
Context: items.map(item => <Link key={item.id} />)
Fix: Add null check or provide default value
```

### 5. Automatic Repair Trigger

Update `PreviewErrorContext.tsx` to auto-trigger repairs:

**Current Flow (Manual):**
```text
Error occurs → Show error UI → User clicks "Auto-Repair" → Repair attempt
```

**New Flow (Automatic):**
```text
Error occurs → 800ms debounce → Auto-trigger repair → Show progress toast → Complete
```

**Key Changes:**
- Remove manual repair button requirement
- Add `useEffect` that watches for errors and auto-triggers
- Show non-blocking toast instead of error overlay during repair
- Only show full error UI after max attempts exhausted

### 6. Enhanced Repair Context

Improve the repair prompt sent to the AI:

**File: `src/context/ChatContext.tsx` - `buildRepairPrompt` function**

Enhanced prompt includes:
- Aggregated error report (multiple errors)
- File content snippets around error locations
- Installed dependencies (from package.json)
- Previous repair attempts and their failures
- Specific fix suggestions based on error type

### 7. Repair Status UI

New component for visual feedback during repair:

**File: `src/components/RepairStatus/RepairStatus.tsx`**

| State | UI Display |
|-------|------------|
| `idle` | Nothing shown |
| `detecting` | Subtle pulsing icon in corner |
| `repairing` | Toast: "Fixing issue in Header.tsx..." |
| `success` | Toast: "Fixed!" (auto-dismiss 2s) |
| `failed` | Expandable error banner with details |

**Toast Styling:**
- Non-blocking (appears in corner)
- Animated entry/exit
- Progress indicator for multi-file repairs
- Clickable to show details

### 8. Multi-Attempt Repair Strategy

Enhanced retry logic with escalating context:

| Attempt | Strategy | Context Size |
|---------|----------|--------------|
| 1 | Standard repair with error info | Affected file only |
| 2 | Include dependent files | 3-5 related files |
| 3 | Full project context + detailed hints | All relevant files |

After 3 failed attempts:
- Show detailed error UI with:
  - Error message and stack trace
  - Affected files highlighted
  - "Try manually" button with suggested prompt
  - "Revert to last working version" button

---

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `src/components/PreviewPanel/SandpackErrorListener.tsx` | Captures Sandpack console/bundler errors |
| `src/hooks/useErrorMonitor.ts` | Central error monitoring and queueing |
| `src/services/ErrorAggregator.ts` | Error deduplication and prioritization |
| `src/components/RepairStatus/RepairStatus.tsx` | Repair progress toast UI |
| `src/components/RepairStatus/RepairStatus.css` | Toast styling |
| `src/components/RepairStatus/index.ts` | Export |

### Modified Files

| File | Changes |
|------|---------|
| `src/shared/types/runtime-error.ts` | Add new error types, priority levels, enhanced classification |
| `src/context/PreviewErrorContext.tsx` | Add auto-trigger logic, error queue, repair state machine |
| `src/context/PreviewErrorContext.context.ts` | Add new state: errorQueue, repairPhase, lastSuccessfulState |
| `src/context/ChatContext.tsx` | Enhanced buildRepairPrompt with aggregated context |
| `src/context/ChatContext.context.ts` | Add repairWithContext method signature |
| `src/components/PreviewPanel/PreviewPanel.tsx` | Integrate SandpackErrorListener |
| `src/components/PreviewPanel/PreviewErrorBoundary.tsx` | Remove manual button, integrate with auto-repair |
| `src/components/AppLayout/AppLayout.tsx` | Add RepairStatus component |
| `src/components/index.ts` | Export new components |
| `src/hooks/index.ts` | Export useErrorMonitor |

---

## User Experience Flow

```text
User makes change via chat
         |
         v
   AI modifies code
         |
         v
   Preview updates
         |
    +----+----+
    |         |
    v         v
  Works    Error occurs
    |         |
    |         v
    |    [Console: "Cannot read property 'map'"]
    |         |
    |         v
    |    [800ms debounce - wait for cascading errors]
    |         |
    |         v
    |    [Toast: "Detected issue, fixing..."]
    |         |
    |         v
    |    [AI analyzes error + file context]
    |         |
    |         v
    |    [AI generates targeted fix]
    |         |
    |         v
    |    [Preview refreshes]
    |         |
    |    +----+----+
    |    |         |
    |    v         v
    |  Fixed    Still broken
    |    |         |
    |    v         v
    | [Toast:   [Retry attempt 2]
    | "Fixed!"]     |
    |              ...
    |               |
    |               v
    |         [After 3 attempts]
    |               |
    |               v
    |         [Show error panel
    |          with details and
    |          manual options]
    |
    v
 Continue working
```

---

## Technical Details

### Error Detection Patterns

**Console Error Parsing:**
```text
Pattern 1: "at Component (src/path/File.tsx:42:15)"
Pattern 2: "at src/path/File.tsx:42:15"
Pattern 3: "(src/path/File.tsx:42:15)"

Ignored patterns:
- "Warning: " (React dev warnings)
- "[HMR]" (Hot module reload messages)
- "Download the React DevTools"
```

**Bundler Error Detection:**
```text
Sandpack status === 'error':
- Extract error message from bundler
- Map to BUILD_ERROR or IMPORT_ERROR
- Trigger immediate repair (no debounce)
```

### Error Priority Handling

```text
Critical (immediate repair):
- BUILD_ERROR: App won't start
- IMPORT_ERROR: Missing module

High (300ms debounce):
- TYPE_ERROR: Null/undefined access
- REFERENCE_ERROR: Undefined variable
- RENDER_ERROR: Component crash

Medium (500ms debounce):
- NETWORK_ERROR: API failures
- CSS_ERROR: Style parsing
- HYDRATION_ERROR: SSR mismatch

Low (no auto-repair):
- DEPRECATION_WARNING: Console warnings
- PERFORMANCE_WARNING: Performance hints
```

### Repair Prompt Structure

```text
=== AUTO-REPAIR REQUEST ===

Project: [project name]
Error Count: 2

--- ERROR 1 (Critical) ---
Type: BUILD_ERROR
Message: Module not found: 'react-icons'
File: src/components/Header.tsx:5

Suggested fixes:
- Add react-icons to package.json dependencies
- Replace with lucide-react (already installed): import { Menu } from 'lucide-react'

--- ERROR 2 (High) ---
Type: TYPE_ERROR
Message: Cannot read properties of undefined (reading 'map')
File: src/components/Header.tsx:42
Code context:
  40 |   return (
  41 |     <nav>
> 42 |       {items.map(item => <Link key={item.id} />)}
  43 |     </nav>
  44 |   );

Suggested fixes:
- Add null check: items?.map(...) or (items || []).map(...)
- Provide default: const items = props.items ?? []

--- INSTALLED DEPENDENCIES ---
react, react-dom, lucide-react, tailwind-merge, clsx

--- INSTRUCTIONS ---
1. Fix all errors in priority order
2. Prefer using installed dependencies over adding new ones
3. Apply minimal changes to fix issues
4. Do not introduce new features, only fix errors
```

---

## Implementation Priority

| Phase | Components | Effort |
|-------|------------|--------|
| 1 | Enhanced error types + classification | Low |
| 2 | SandpackErrorListener + console monitoring | Medium |
| 3 | ErrorAggregator service | Medium |
| 4 | Auto-trigger logic in PreviewErrorContext | Medium |
| 5 | RepairStatus toast UI | Low |
| 6 | Enhanced repair prompts | Low |
| 7 | Multi-attempt strategy with escalation | Medium |

---

## Success Criteria

1. Errors automatically detected within 1 second of occurrence
2. 80%+ of common errors fixed without user intervention
3. Clear visual feedback throughout repair process
4. No infinite repair loops (max 3 attempts per error batch)
5. Graceful fallback to manual intervention with helpful context
6. Project always reaches a buildable state (even if degraded)
