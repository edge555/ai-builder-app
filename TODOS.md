# TODOS

## P1 — Security

- [x] Rate limiter: Fix X-Forwarded-For IP spoofing — implemented rightmost-trusted IP pattern with `TRUSTED_PROXY_DEPTH` config in `guard.ts`

- [ ] CSRF: Wire up origin-based CSRF protection on mutation endpoints
  Context: `getCorsHeaders(request, { rejectInvalidOrigin: true })` is implemented in `backend/lib/api/utils.ts`.
  Remaining: call it with `rejectInvalidOrigin: true` on POST/PUT routes (`/api/generate`, `/api/modify`, etc.) and add integration tests verifying 403 on missing/invalid Origin. Note: will reject non-browser clients (curl, server-to-server) — confirm this is acceptable before enabling.

## P2 — Test Coverage

- [x] Backend: `build-validator.ts` unit tests (42 tests)
- [x] Backend: `ai-retry.ts` unit tests (17 tests, recordOperation mock added)
- [x] Backend: `agent-router.ts` unit tests (already existed — 23 tests)
- [x] Backend: `auth.ts` unit tests (already existed — 13 tests)
- [x] Backend: `streaming-generator.ts` integration tests (expanded to 17 tests)
- [x] Frontend: `ChatInterface.tsx`, `AppLayout.tsx`, `AuthGuard`, `FileTreeSidebar` tests (64 tests)

## P2 — Type Safety

- [ ] Add Zod schemas for `SerializedVersion` and `FileDiff` API responses
- [ ] Remove `as any` casts from test files
- [ ] Add `RuntimeError` serialization helpers to shared package

## P3 — Observability

- [ ] Metrics export endpoint (decide stack: Prometheus / StatsD / Vercel Analytics)
- [x] Add logging to `BuildValidator` (file rejection reasons) — debug/warn logs added
- [x] Log HTTP status codes in route handlers — `withRouteContext` logs method, path, status, durationMs

## P3 — Quality

- [ ] Conventional commit enforcement (commitlint in CI)
- [ ] Split large components: `FileTreeSidebar` (371 lines), `ProjectGallery` (444 lines)
- [x] Normalize import paths — standardized on `@ai-app-builder/shared/types` (10 files migrated)
- [x] Add `beforeunload` warning during active generation (implemented in `useSubmitPrompt`)
- [x] Auth token refresh/expiry handling — `AuthContext` auto-redirects to `/login` on `SIGNED_OUT` event via `wasAuthenticatedRef`
