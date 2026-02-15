# Performance Improvement Plan

**Project:** AI App Builder (blank-canvas-app)
**Date:** 2026-02-15
**Total issues identified:** 62
**Estimated total effort:** 14-20 days

---

## Executive Summary

A comprehensive analysis of the frontend (React/Vite), backend (Next.js), and shared package identified performance issues across 6 categories. The plan aims to eliminate resource leaks, optimize rendering, and establish a performance baseline for long-term stability.

---

## Phase Overview

| Phase | Focus | Tasks | Effort | Priority |
|-------|-------|-------|--------|----------|
| [x] [Phase 1](phase-1-critical-fixes.md) | Critical Fixes | 6 | 1-2 days | **Immediate** |
| [x] [Phase 2](phase-2-memory-resource-management.md) | Memory & Resources | 7 | 2-3 days | **High** |
| [x] [Phase 3](phase-3-rendering-ui-performance.md) | Rendering & UI | 8 | 3-4 days | **Medium** |
| [x] [Phase 4](phase-4-build-bundle-optimization.md) | Build & Bundle | 7 | 2-3 days | **Medium** |
| [ ] [Phase 5](phase-5-architecture-code-quality.md) | Architecture & Quality | 8 | 3-5 days | **Low-Medium** |

---

## # [ ] Phase 1: Critical Fixes (Immediate, 1-2 days)

Prevents crashes and resource exhaustion. Should be done before any deployment.

- **1.1** Fix SSE stream connection leak on client disconnect
- **1.2** Fix unbounded buffer accumulation in Gemini JSON parser
- **1.3** Fix version manager unbounded in-memory storage
- **1.4** Add request timeouts to non-streaming API routes
- **1.5** Fix resize event listener re-registration (60+/sec)
- **1.6** Fix Monaco editor forced remount on external updates

[Full details ->](phase-1-critical-fixes.md)

---

## # [ ] Phase 2: Memory & Resource Management (High, 2-3 days)

Plugs remaining memory leaks and adds resource controls.

- **2.1** Implement Gemini cache expiry cleanup
- **2.2** Implement backpressure handling in SSE streaming
- **2.3** Add rate limiting middleware
- **2.4** Fix FilePlanner cache memory issues
- **2.5** Optimize IndexedDB storage operations
- **2.6** Fix useAutoSave race condition in StrictMode
- **2.7** Optimize useUndoRedo sessionStorage writes

[Full details ->](phase-2-memory-resource-management.md)

---

## # [ ] Phase 3: Rendering & UI Performance (Medium, 3-4 days)

Reduces unnecessary re-renders and improves perceived performance.

- **3.1** Split context providers to reduce cascading re-renders
- **3.2** Add React.memo to expensive components
- **3.3** Add virtualization for long lists
- **3.4** Debounce search input with useDeferredValue
- **3.5** Fix PreviewSection over-subscription to error context
- **3.6** Optimize Sandpack file updates
- **3.7** Fix AutoRepairProvider unstable dependencies
- **3.8** Add error boundaries around lazy components

[Full details ->](phase-3-rendering-ui-performance.md)

---

## # [ ] Phase 4: Build & Bundle Optimization (Medium, 2-3 days)

Reduces bundle size and improves load times.

- **4.1** Add Vite manual chunk splitting
- **4.2** Fix shared package import path (source vs dist)
- **4.3** Enable shared package code splitting
- **4.4** Make sourcemaps conditional (dev only)
- **4.5** Enable frontend TypeScript strict mode
- **4.6** Clean up duplicate and unused dependencies
- **4.7** Add Next.js production optimizations

[Full details ->](phase-4-build-bundle-optimization.md)

---

## # [ ] Phase 5: Architecture & Code Quality (Low-Medium, 3-5 days)

Long-term maintainability and developer experience improvements.

- **5.1** Move Prettier formatting to worker pool
- **5.2** Optimize incremental JSON parser (O(n^2) -> O(n))
- **5.3** Cache dependency graph between calls
- **5.4** Split large frontend components (510-line AppLayout, etc.)
- **5.5** Add input validation & size limits to API routes
- **5.6** Use request headers for Gemini API key
- **5.7** Add comprehensive ESLint rules
- **5.8** Improve streaming error recovery

[Full details ->](phase-5-architecture-code-quality.md)

---

## Success Metrics

After completing all phases, measure:

1. **Memory stability**: Server RSS stays flat over 24h under load (no growth)
2. **Bundle size**: Initial page load < 500KB (gzipped)
3. **Time to interactive**: WelcomePage < 2s, BuilderPage < 3s
4. **Render efficiency**: React Profiler shows < 5 unnecessary renders per user action
5. **API response time**: p95 < 500ms for non-AI routes (diff, export, revert)
6. **Streaming latency**: First file appears within 2s of stream start
7. **Resize smoothness**: Constant 60fps during panel resize
8. **Editor responsiveness**: Keystroke latency < 16ms in Monaco
