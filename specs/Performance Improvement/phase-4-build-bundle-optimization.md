# [ ] Phase 4: Build & Bundle Optimization

**Estimated effort:** 2-3 days
**Impact:** Faster initial page load, smaller bundle size, better caching

---

## [x] Task 4.1: Add Vite Manual Chunk Splitting

**Files:**
- `frontend/vite.config.ts`

**Problem:**
No `build` configuration exists in Vite config. All code ships as a single chunk (or Vite's default splitting). Heavy dependencies are not isolated:
- `@codesandbox/sandpack-react`: ~400KB
- `@monaco-editor/react` + Monaco: ~250KB wrapper + ~3MB editor
- `react-syntax-highlighter`: ~300KB
- `@supabase/supabase-js`: ~95KB

Users download all of this on first page load, even on the WelcomePage where none of it is needed.

**Fix:**
Add `build.rollupOptions.output.manualChunks` to vite.config.ts:
```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        'vendor-sandpack': ['@codesandbox/sandpack-react'],
        'vendor-monaco': ['@monaco-editor/react'],
        'vendor-supabase': ['@supabase/supabase-js'],
        'vendor-syntax': ['react-syntax-highlighter'],
      }
    }
  },
  sourcemap: false,
  chunkSizeWarningLimit: 500,
}
```

**Acceptance criteria:**
- Bundle split into 5+ chunks
- WelcomePage loads without downloading Monaco or Sandpack
- Each chunk under 500KB (warning threshold)
- Verify with `npx vite-bundle-visualizer`

---

## [x] Task 4.2: Fix Shared Package Import Path (Source vs Dist)

**Files:**
- `frontend/vite.config.ts` (resolve.alias)
- `backend/next.config.js` (transpilePackages)
- `shared/tsup.config.ts`

**Problem:**
Frontend imports shared package from TypeScript source (`../shared/src`) instead of built distribution (`../shared/dist`). This:
- Bypasses tsup's optimizations (minification, tree-shaking)
- Forces Vite to transpile shared package at dev/build time
- Backend also transpiles shared at runtime via `transpilePackages`

**Fix:**
1. Update frontend Vite alias: `"@/shared": path.resolve(__dirname, "../shared/dist")`
2. Remove `transpilePackages: ['@ai-app-builder/shared']` from next.config.js
3. Ensure shared package's `package.json` has correct `main`, `module`, and `exports` fields
4. Add `npm run build` for shared as a prerequisite to frontend/backend dev scripts
5. In development, use `tsup --watch` for shared package

**Acceptance criteria:**
- Frontend and backend consume pre-built shared package
- No transpilation of shared package during build
- Types still resolve correctly in IDE
- Dev workflow: shared changes auto-rebuild

---

## [x] Task 4.3: Enable Shared Package Code Splitting

**Files:**
- `shared/tsup.config.ts`
- `shared/src/index.ts`
- `shared/package.json`

**Problem:**
`splitting: false` in tsup config produces a single monolithic bundle. All consumers import everything even if they only need `sanitizeError()` or diff utilities. Zod runtime (~15KB) is included in frontend bundle even when only types are needed.

**Fix:**
1. Enable `splitting: true` in tsup config
2. Add multiple entry points in tsup config:
   ```typescript
   entry: {
     'index': 'src/index.ts',
     'types': 'src/types/index.ts',
     'schemas': 'src/schemas/api.ts',
     'utils': 'src/utils/index.ts',
   }
   ```
3. Add `exports` field in package.json for subpath imports:
   ```json
   "exports": {
     ".": "./dist/index.js",
     "./types": "./dist/types.js",
     "./schemas": "./dist/schemas.js",
     "./utils": "./dist/utils.js"
   }
   ```
4. Update consumers to use specific imports where possible

**Acceptance criteria:**
- Frontend importing only types doesn't bundle Zod runtime
- Each entry point tree-shakeable independently
- No breaking changes to existing import paths

---

## [x] Task 4.4: Make Sourcemaps Conditional

**Files:**
- `shared/tsup.config.ts` (line 8)
- `frontend/vite.config.ts`

**Problem:**
- Shared package always generates sourcemaps (+127KB in package)
- Declaration maps always generated (+60KB)
- No explicit sourcemap control in Vite production build

**Fix:**
1. Make shared sourcemaps conditional:
   ```typescript
   sourcemap: process.env.NODE_ENV !== 'production',
   ```
2. Disable declaration maps for production builds
3. Add explicit `sourcemap: false` to Vite production build config
4. Keep sourcemaps enabled in development for debugging

**Acceptance criteria:**
- Production builds have no sourcemaps (shared + frontend)
- Development builds retain sourcemaps for debugging
- Production bundle 187KB+ smaller

---

## [x] Task 4.5: Enable Frontend TypeScript Strict Mode

**Files:**
- `frontend/tsconfig.json` (lines 22-25)

**Problem:**
Frontend has `strict: false`, overriding the strict base config. This disables:
- `noUnusedLocals`: dead variables not caught
- `noUnusedParameters`: unused function args not caught
- `noImplicitAny`: type safety gaps
- `strictNullChecks`: null reference bugs not caught at compile time

**Fix:**
1. Enable `strict: true` in frontend tsconfig
2. Fix all resulting type errors (expect 50-200 errors)
3. Prioritize: fix `noImplicitAny` errors first (most impactful)
4. Use `// @ts-expect-error` sparingly for third-party type issues
5. Split into sub-tasks if error count is high

**Acceptance criteria:**
- `strict: true` enabled and compiling without errors
- No `// @ts-ignore` comments (use `@ts-expect-error` with explanation)
- All function parameters typed
- No unused variables or imports

---

## [ ] Task 4.6: Clean Up Duplicate and Unused Dependencies

**Files:**
- Root `package.json`
- `frontend/package.json`
- `backend/package.json`
- `shared/package.json`

**Problem:**
1. `typescript` duplicated across all 4 workspace package.json files
2. `vitest` duplicated in all 3 workspaces
3. `@supabase/supabase-js` in frontend but possibly unused (no imports found)
4. `react` and `react-dom` in backend (unnecessary for API-only server)
5. Multiple conflicting path aliases in frontend tsconfig (4 variants pointing to same location)

**Fix:**
1. Hoist shared devDependencies (`typescript`, `vitest`) to root package.json
2. Verify `@supabase/supabase-js` usage; remove if unused
3. Remove `react`/`react-dom` from backend if not needed
4. Consolidate path aliases to single canonical form
5. Run `npm dedupe` after changes

**Acceptance criteria:**
- No duplicate dependencies across workspaces
- Unused dependencies removed
- `npm ls` shows clean dependency tree
- All tests still pass after cleanup

---

## [ ] Task 4.7: Add Next.js Production Optimizations

**Files:**
- `backend/next.config.js`

**Problem:**
Minimal Next.js config with no production optimizations. Missing:
- SWC minification
- Sourcemap control
- Compression
- Header removal
- On-demand entries tuning

**Fix:**
```javascript
const nextConfig = {
  swcMinify: true,
  productionBrowserSourceMaps: false,
  compress: true,
  poweredByHeader: false,
  onDemandEntries: {
    maxInactiveAge: 15000,
    pagesBufferLength: 2,
  },
};
```

**Acceptance criteria:**
- Backend response size reduced (compression enabled)
- No `X-Powered-By` header in responses
- Build output smaller with SWC minification
