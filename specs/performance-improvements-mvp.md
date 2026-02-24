# Performance Improvements Plan — Consumer MVP

## Context

blank-canvas-app is an AI-powered application builder where users describe apps in natural language and get generated React projects with live preview (Sandpack) and code editing (Monaco). The app is a monorepo: React 18 + Vite frontend, Next.js 14 backend, shared TypeScript package.

**Goal:** Optimize for a consumer-level MVP — fast initial load, responsive interactions, and reliable operation under real user traffic. No backward compatibility constraints.

**Already optimized (not in scope):** Split context pattern, React.memo on major components, list virtualization, lazy loading for Monaco/Sandpack, Vite manual chunks, O(n) incremental JSON parser, dependency graph caching, SSE backpressure, worker pool for Prettier, error boundaries, useDeferredValue for search.

---

## Phase 1: Critical MVP Performance (User Experience)

Items that directly impact what users feel — load time, interaction speed, perceived responsiveness.

### 1.1 Route-Level Code Splitting

- [x] Convert page imports in `App.tsx` to `React.lazy()` so BuilderPage's heavy tree (Sandpack, Monaco, 7 context providers) only loads on navigation to `/project/`
- [x] Remove eager exports from `pages/index.ts`
- [x] Add `<Suspense fallback={<PageSkeleton />}>` around each route
- [x] Ensure each page file has a `default export`

**Files:** `frontend/src/App.tsx`, `frontend/src/pages/index.ts`
**Impact:** HIGH — Reduces initial bundle by the entire BuilderPage dependency tree. WelcomePage loads significantly faster.
**Verify:** Network tab shows BuilderPage chunk loads only on navigation to `/project/*`. Lighthouse score improves.

---

### 1.2 Preload Critical Chunks on Hover/Intent

- [x] Add `onMouseEnter` preload on WelcomePage "Create" button and project cards that triggers `import('./pages/BuilderPage')`
- [x] Optionally use `requestIdleCallback` to preload after WelcomePage settles

**Files:** `frontend/src/pages/WelcomePage.tsx`
**Impact:** MEDIUM — Hides lazy-load latency; navigation to builder feels instant.
**Verify:** Network tab shows chunk fetched on hover, not on click.

---

### 1.3 Avoid Sandpack Full Remount on Refresh

- [x] Remove `key={refreshKey}` from `<SandpackProvider>`
- [x] Use Sandpack's `useSandpack()` hook to call `sandpack.resetAllFiles()` or dispatch a reload without destroying the iframe
- [x] Create a `SandpackRefresher` child component that exposes refresh via ref/callback

**Files:** `frontend/src/components/PreviewPanel/PreviewPanel.tsx`, `frontend/src/components/PreviewPanel/SandpackRefresher.tsx`
**Impact:** HIGH — Sandpack init is expensive (iframe creation, dep install, bundling). Avoiding remount saves 1-3s per refresh.
**Verify:** Click refresh; no white flash, no new iframe creation in DevTools.

---

### 1.4 Stabilize ProjectContext setProjectState Callback

- [x] Use `useRef` for `projectState` inside `setProjectState` callback to break the dependency cycle
- [x] Reduce `useCallback` deps to only stable references (`undoRedo.pushState`)
- [x] Similarly stabilize `renameProject`

**Files:** `frontend/src/context/ProjectContext.tsx`
**Impact:** HIGH — Root cause of cascading re-renders. Currently every state change invalidates all action consumers, negating the split-context optimization.
**Verify:** React DevTools profiler — after state change, components using only `useProjectActions()` do NOT re-render.

---

### 1.5 Stabilize useCollapsibleMessages Return Object

- [x] Wrap return object in `useMemo` with proper dependencies

**Files:** `frontend/src/hooks/useCollapsibleMessages.ts`
**Impact:** MEDIUM — Prevents ChatInterface re-renders when collapse state hasn't changed.
**Verify:** React DevTools profiler shows no unnecessary ChatInterface re-renders.

---

### 1.6 FileTreeSidebar Smart Default Expansion

- [x] Initialize `expandedDirs` with only top-level directories (depth 0-1) instead of all
- [x] Add "Expand All" / "Collapse All" button in the file tree header
- [x] New directories added during generation start collapsed by default

**Files:** `frontend/src/components/CodeEditor/FileTreeSidebar.tsx`
**Impact:** MEDIUM — Fewer DOM nodes on initial render, better UX for large projects (30+ files).
**Verify:** Generate a 30+ file project; only top-level dirs expanded initially.

---

### 1.7 Request Deduplication for Generation

- [x] Track active request's `AbortController` in a ref
- [x] If a new submit arrives while one is in-flight, abort the previous one
- [x] Pass `controller.signal` through to generation API calls

**Files:** `frontend/src/hooks/useSubmitPrompt.ts`
**Impact:** MEDIUM — Prevents wasted AI API calls and double-responses on rapid clicks.
**Verify:** Double-click submit rapidly; only one generation runs. Network tab shows first request aborted.

---

## Phase 2: Scalability & Reliability (Handling Real Users)

Items needed for the app to handle concurrent users without burning money or breaking.

### 2.1 Storage Request Coalescing

- [ ] Add write queue to `StorageService` that coalesces concurrent writes to the same project ID
- [ ] If a save is in-flight, buffer the next save (latest wins) and execute after current completes
- [ ] Prevents racing between auto-save and manual saves during streaming

**Files:** `frontend/src/services/storage/StorageService.ts`
**Impact:** MEDIUM — Reduces IndexedDB contention during streaming, prevents data corruption.
**Verify:** During streaming generation, fewer IndexedDB transactions than state updates.

---

### 2.2 Request ID Propagation

- [ ] Add `requestId` parameter to `generateProjectStreaming()`, `modifyProject()`, and AI provider `generate()` methods
- [ ] Pass through full call chain with `logger.withRequestId(requestId)`
- [ ] Return `X-Request-Id` header in API responses

**Files:** `backend/app/api/generate-stream/route.ts`, `backend/app/api/modify/route.ts`, `backend/lib/core/streaming-generator.ts`, `backend/lib/ai/ai-provider.ts`
**Impact:** MEDIUM — Essential for debugging production issues. Zero performance cost.
**Verify:** All backend logs for a request share the same requestId. Response includes `X-Request-Id`.

---

### 2.3 API Response Compression

- [ ] Verify `compress: true` in `next.config.js` applies gzip to API responses
- [ ] For large JSON endpoints (`/api/modify`, `/api/export`), add explicit gzip if needed
- [ ] For SSE, consider batching multiple file events into single messages

**Files:** `backend/next.config.js`, large response route handlers
**Impact:** LOW-MEDIUM — 60-80% reduction in transfer size for large responses.
**Verify:** `Content-Encoding: gzip` in response headers. Compare transfer sizes.

---

## Phase 3: Polish & Production Quality

Nice-to-haves that make the product feel professional and maintainable long-term.

### 3.1 CSS Optimization

- [ ] With route-level splitting (1.1), CSS auto-splits per chunk — verify this works
- [ ] Consider converting component CSS to CSS modules (`.module.css`) for tree-shaking
- [ ] Extract critical above-the-fold CSS for WelcomePage into inline `<style>` in `index.html`

**Files:** `frontend/vite.config.ts`, component `.css` files
**Impact:** LOW — CSS is small relative to JS. Biggest win comes from route splitting.
**Verify:** Lighthouse CSS utilization shows less unused CSS.

---

### 3.2 Web Vitals Monitoring

- [ ] Install `web-vitals` library
- [ ] Capture CLS, LCP, FID, TTFB — log in dev, report to analytics endpoint in prod
- [ ] Add `performance.mark()`/`performance.measure()` around key operations (streaming parse, Sandpack init, storage writes)
- [ ] Backend: enhance existing `metrics.ts` with request duration logging per route

**Files:** Create `frontend/src/utils/performance.ts`, modify `frontend/src/main.tsx`, enhance `backend/lib/metrics.ts`
**Impact:** LOW (no user-facing improvement) — Critical for identifying regressions post-launch.
**Verify:** Console shows web-vitals metrics. Backend logs include request duration.

---

---

## Summary

| #   | Task                                  | Impact      | Effort | Phase |
|-----|---------------------------------------|-------------|--------|-------|
| 1.1 | Route-level code splitting            | HIGH        | Low    | 1     |
| 1.2 | Preload chunks on hover               | MEDIUM      | Low    | 1     |
| 1.3 | Avoid Sandpack full remount           | HIGH        | Medium | 1     |
| 1.4 | Stabilize ProjectContext callbacks    | HIGH        | Low    | 1     |
| 1.5 | Stabilize useCollapsibleMessages      | MEDIUM      | Low    | 1     |
| 1.6 | FileTreeSidebar smart expansion       | MEDIUM      | Low    | 1     |
| 1.7 | Request deduplication                 | MEDIUM      | Low    | 1     |
| 2.1 | Storage request coalescing            | MEDIUM      | Medium | 2     |
| 2.2 | Request ID propagation                | MEDIUM      | Low    | 2     |
| 2.3 | API response compression              | LOW-MEDIUM  | Low    | 2     |
| 3.1 | CSS optimization                      | LOW         | Low    | 3     |
| 3.2 | Web Vitals monitoring                 | LOW         | Medium | 3     |

**Recommended execution order in Phase 1:** 1.4 → 1.1 → 1.3 → 1.2 → 1.5/1.6/1.7
