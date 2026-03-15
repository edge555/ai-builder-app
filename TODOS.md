# TODOS

## P1 — Security

- [ ] Rate limiter: Fix X-Forwarded-For IP spoofing (`backend/lib/api/guard.ts:28-36`)
  Context: `getClientIp()` trusts the first IP in `X-Forwarded-For`. An attacker can rotate IPs to bypass rate limits.
  Fix: Use the rightmost-trusted IP pattern or rely on `request.ip` from the deployment platform.

- [ ] CSRF: Add CSRF token verification on mutation endpoints
  Context: POST endpoints (`/api/generate`, `/api/modify`, `/api/plan`, etc.) have no CSRF token verification.

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
- [ ] Add logging to `BuildValidator` (file rejection reasons)
- [ ] Log HTTP status codes in route handlers

## P3 — Quality

- [ ] Conventional commit enforcement (commitlint in CI)
- [ ] Split large components: `FileTreeSidebar` (371 lines), `ProjectGallery` (444 lines)
- [ ] Normalize import paths (pick `@/shared` OR `@ai-app-builder/shared`)
- [ ] Add `beforeunload` warning during active generation
- [ ] Auth token refresh/expiry handling
