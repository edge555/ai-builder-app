# [x] Phase 3: Rendering & UI Performance

**Estimated effort:** 3-4 days
**Impact:** Smoother UI, fewer unnecessary re-renders, better perceived performance
**Status:** ✅ Complete - All 8 tasks implemented successfully

---

## [x] Task 3.1: Split Context Providers to Reduce Cascading Re-renders

**Files:**
- `frontend/src/context/GenerationContext.tsx` (lines 372-404)
- `frontend/src/context/ProjectContext.tsx`
- `frontend/src/pages/BuilderPage.tsx` (lines 123-145)

**Problem:**
`GenerationContext` exposes 14 values in a single context object. When any value changes (e.g., `isLoading` toggles), ALL consumers re-render -- even those that only use `generateProject`. The BuilderPage has 7 nested providers, amplifying cascading updates.

**Fix:**
1. Split `GenerationContext` into two contexts:
   - `GenerationStateContext`: read-only state (`isLoading`, `loadingPhase`, `error`, `streamingState`, `isStreaming`, `isAutoRepairing`, `autoRepairAttempt`)
   - `GenerationActionsContext`: stable callbacks (`generateProject`, `generateProjectStreaming`, `modifyProject`, `autoRepair`, `resetAutoRepair`, `clearError`, `abortCurrentRequest`)
2. Actions context value should be stable (callbacks wrapped in `useCallback` with minimal deps)
3. Components that only call actions won't re-render on state changes
4. Apply the same pattern to other large contexts if needed

**Acceptance criteria:**
- Components using only generation actions don't re-render on state changes
- No behavior changes to existing functionality
- React DevTools Profiler shows reduced render counts on BuilderPage

---

## [x] Task 3.2: Add React.memo to Expensive Components

**Files:**
- `frontend/src/components/PreviewPanel/PreviewPanel.tsx` (line 103)
- `frontend/src/components/ChatInterface/ChatInterface.tsx`
- `frontend/src/components/CodeEditor/CodeEditorView.tsx`
- `frontend/src/components/ProjectGallery/ProjectGallery.tsx`

**Problem:**
Major components are not wrapped in `React.memo`. When parent re-renders (from context changes, state updates), these components re-render even if their props haven't changed. PreviewPanel is especially expensive because it contains Sandpack.

**Fix:**
1. Wrap `PreviewPanel`, `ChatInterface`, `CodeEditorView`, and `ProjectGallery` in `React.memo`
2. Add custom comparison functions where needed (e.g., shallow compare `projectState.files`)
3. Ensure callback props passed to these components are stable (`useCallback`)
4. Memoize object/array props with `useMemo`

**Acceptance criteria:**
- PreviewPanel only re-renders when its relevant props change
- Sandpack doesn't re-initialize on unrelated state changes
- Profiler shows 50%+ reduction in unnecessary renders

---

## [x] Task 3.3: Add Virtualization for Long Lists

**Files:**
- `frontend/src/components/ProjectGallery/ProjectGallery.tsx`
- `frontend/src/components/ChatInterface/ChatInterface.tsx`
- `frontend/src/components/CodeEditor/FileTreeSidebar.tsx`

**Problem:**
All list items are rendered to the DOM even when off-screen. With 100+ saved projects, 200+ chat messages, or 100+ files, the DOM becomes bloated, causing slow scroll and high memory usage.

**Fix:**
1. Add `react-window` or `@tanstack/virtual` as dependency
2. Virtualize `ProjectGallery` project list (variable height cards)
3. Virtualize `ChatInterface` message list (variable height messages)
4. Virtualize `FileTreeSidebar` when file count exceeds threshold (e.g., 50 files)
5. Keep simple rendering for small lists (< 20 items) to avoid complexity

**Acceptance criteria:**
- Only visible items + buffer rendered in DOM
- Smooth scrolling with 500+ items
- No visual difference for lists under 20 items
- Scroll position maintained on re-render

---

## [x] Task 3.4: Debounce Search Input with useDeferredValue

**Files:**
- `frontend/src/components/ProjectGallery/ProjectGallery.tsx` (lines 39-68)

**Problem:**
Filtering and sorting runs synchronously on every keystroke in the search input. The `useMemo` re-computes on every `searchQuery` change. For large project lists, this blocks the UI during typing.

**Fix:**
1. Use `useDeferredValue(searchQuery)` for the filtering computation
2. Or add manual debouncing (300ms) on the search input state
3. Show a subtle loading indicator when deferred value is stale
4. Also memoize `recentProjects` to avoid redundant sort+copy on every render

**Acceptance criteria:**
- Search input feels responsive (no typing lag)
- Filter results appear within 300ms of last keystroke
- No UI jank with 200+ projects

---

## [x] Task 3.5: Fix PreviewSection Over-subscription to Error Context

**Files:**
- `frontend/src/components/AppLayout/AppLayout.tsx` (lines 113-223)

**Problem:**
`PreviewSection` destructures 12 properties from `usePreviewError()`. Every error state change triggers a full re-render of the preview section, including Sandpack. Most error state changes are irrelevant to the preview render.

**Fix:**
1. Extract error display logic into a separate `ErrorOverlay` component
2. `PreviewSection` should only subscribe to props it directly needs for rendering
3. Move error monitoring callbacks to a separate hook that doesn't cause re-renders
4. Use `useRef` for values only needed in callbacks (not for rendering)

**Acceptance criteria:**
- Preview doesn't re-render when error count changes
- Error overlay updates independently from preview
- Sandpack stays stable during error state transitions

---

## [x] Task 3.6: Optimize Sandpack File Updates

**Files:**
- `frontend/src/components/PreviewPanel/PreviewPanel.tsx` (lines 131-166, 341-385)

**Problem:**
`sandpackFiles` useMemo depends on the entire `projectState` object. When any project metadata changes (even non-file changes), the memoized value recomputes and Sandpack reinitializes. `transformFilesForSandpack` also runs on every project state change.

**Fix:**
1. Change dependency from `projectState` to `projectState.files` ✅
2. Add deep equality check: only recompute if file contents actually changed ✅
3. Use a ref to track previous files and compare with shallow/deep equality ✅
4. Consider using `useMemo` with a custom comparator for the files object ✅

**Acceptance criteria:**
- Sandpack only updates when file contents change ✅
- Metadata-only changes don't trigger preview refresh ✅
- File rename correctly triggers update ✅

**Status:** Already implemented during Task 3.2 (React.memo optimization)

---

## [x] Task 3.7: Fix AutoRepairProvider Unstable Dependencies

**Files:**
- `frontend/src/context/AutoRepairContext.tsx` (lines 21-70)

**Problem:**
The `useEffect` depends on `previewError.shouldAutoRepair` which is a function recreated on every render. This causes the effect to re-run constantly, potentially triggering unnecessary auto-repair evaluations. The `.then()` call also lacks `.catch()` for error handling.

**Fix:**
1. Split context usage to `usePreviewErrorState` and `usePreviewErrorActions` ✅
2. Inline auto-repair check in useEffect to avoid unstable function dependency ✅
3. Add `.catch()` to the `generation.autoRepair()` promise ✅
4. Add a `isEvaluatingRef` to prevent concurrent auto-repair evaluations ✅
5. Reduce effect dependencies to only the values that actually matter ✅
6. Add proper error handling with try/catch in manual trigger ✅

**Acceptance criteria:**
- Auto-repair effect runs only when repair conditions change ✅
- No unhandled promise rejections ✅
- No duplicate auto-repair attempts ✅

**Implementation details:**
- Replaced `usePreviewError()` with split `usePreviewErrorState()` and `usePreviewErrorActions()`
- Inlined `shouldAutoRepair` logic directly in useEffect to avoid function dependency
- Added `isEvaluatingRef` to prevent concurrent auto-repair evaluations
- Added `.catch()` and `.finally()` handlers to auto-repair promise
- Added try/catch/finally blocks to manual `triggerAutoRepair` function
- Reduced effect dependencies to only essential state values and stable action callbacks

---

## [x] Task 3.8: Add Error Boundaries Around Lazy Components

**Files:**
- `frontend/src/components/CodeEditor/CodeEditorView.tsx` (lines 201-213)
- `frontend/src/components/AppLayout/AppLayout.tsx`

**Problem:**
Suspense boundaries exist for lazy-loaded Monaco and Sandpack, but no Error Boundaries wrap them. If Monaco fails to load (network error, worker crash), the entire app crashes instead of showing a fallback.

**Fix:**
1. Create a generic `ComponentErrorBoundary` with retry button ✅
2. Wrap `MonacoEditorWrapper` Suspense with error boundary ✅
3. Wrap `PreviewPanel` Suspense with error boundary ✅ (Already existed with PreviewErrorBoundary)
4. Show user-friendly error message with "Retry" action ✅
5. Log errors to console for debugging ✅

**Acceptance criteria:**
- Monaco load failure shows fallback UI, not white screen ✅
- Sandpack crash shows error message with retry button ✅
- Rest of app remains functional when one panel errors ✅

**Implementation details:**
- Created generic `ComponentErrorBoundary` component with retry functionality
- ComponentErrorBoundary shows error icon, message, retry button, and collapsible stack trace
- Wrapped Monaco editor Suspense in CodeEditorView with ComponentErrorBoundary
- PreviewPanel already wrapped with PreviewErrorBoundary (has auto-repair functionality)
- Both boundaries catch lazy load failures and render errors
- Errors logged to console with component name and stack trace

**Files created:**
- [ComponentErrorBoundary.tsx](frontend/src/components/ComponentErrorBoundary/ComponentErrorBoundary.tsx)
- [ComponentErrorBoundary.css](frontend/src/components/ComponentErrorBoundary/ComponentErrorBoundary.css)
- [index.ts](frontend/src/components/ComponentErrorBoundary/index.ts)

**Files modified:**
- [CodeEditorView.tsx](frontend/src/components/CodeEditor/CodeEditorView.tsx) - Added ComponentErrorBoundary around Monaco
- [components/index.ts](frontend/src/components/index.ts) - Exported ComponentErrorBoundary
