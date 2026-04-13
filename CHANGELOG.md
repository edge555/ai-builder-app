# Changelog

All notable changes to this project will be documented in this file.

## [1.9.0] - 2026-04-09

### Added
- **Beginner/classroom-safe generation mode** — workspaces can now enable `beginner_mode`, which constrains generated output to 4-6 file React SPAs with no `fetch()`/`axios` calls and at least two event handlers. `AcceptanceGate.validate()` enforces these constraints and rejects non-compliant output.
- **`HeuristicPlanBuilder`** — deterministic fallback plan for beginner mode. Recognises keyword clusters (counter, todo, quiz, form, calculator) and produces a 5-file plan with the correct component stub; falls back to a safe 4-file generic plan. Eliminates AI planning latency for the classroom path.
- **`react-spa-beginner` recipe** — new pluggable generation recipe with prompt fragments that explicitly prohibit network calls and guide the model toward simple state-only patterns. Automatically selected when `beginnerMode` is `true`, overriding intent-based recipe selection.
- **Admin workspace API endpoints** — `GET /api/org/:orgId/workspaces/:wid` (workspace detail) and `PATCH /api/org/:orgId/workspaces/:wid` (update name or `beginner_mode`). Both require org-admin auth and double-check IDOR (`org_id` cross-reference).
- **Admin workspace metrics endpoint** — `GET /api/org/:orgId/workspaces/:wid/metrics` returns per-member generation event counts and repair-trigger rates for the admin dashboard.
- **Admin UI: beginner mode toggle** — `AdminWorkspacePage` now shows a "Classroom (beginner) mode" toggle that calls the new PATCH endpoint. Visual indicator appears on enabled workspaces.
- **Supabase migration** — `20260409_beginner_mode.sql` adds `beginner_mode boolean NOT NULL DEFAULT false` to the `workspaces` table.
- **Classroom eval infrastructure** — `classroom-baseline.test.ts`, `live-eval-suite.ts`, and `reference-prompts.ts` provide a repeatable eval harness for the 5 classroom prompt types. Baseline report committed at 40% pass rate (pre JSON-format fix).

### Changed
- **`WorkspaceResolveResult`** now includes `beginnerMode: boolean`, propagated through `resolveWorkspaceProvider` → `generate-stream` route → `generateProjectStreaming` → `runGeneration` → `selectRecipe` and `AcceptanceGate.validate()`.
- **`HeuristicPlanBuilder` wired up** — `generation-pipeline.ts` now calls `buildHeuristicPlan()` when in beginner mode (bypasses AI planning entirely) and as the fallback when `resolveArchitecturePlan()` throws.
- **JSON output format enforced** — `PhaseExecutor` system prompts now explicitly require JSON output with no markdown fences. Fixes the root cause of the 40% classroom baseline failure rate where Gemini/minimax returned markdown code blocks the incremental JSON parser could not parse.
- **`SupabaseJwk` type** — `auth.ts` uses a more specific `SupabaseJwk` type (extends `JsonWebKey` with optional `kid`) for `jwksCache` and `fetchJwks`, eliminating implicit `any` casts in the JWKS verification path.

### Fixed
- **`lightValidate` available in PATCH handler** — `ModificationEngine` previously lacked a pre-repair validation shortcut. `AcceptanceGate.lightValidate()` (structural + placeholder, no build validation) is now exposed and used by the modification pipeline.

## [1.8.1] - 2026-04-07

### Changed
- **GenerationContext refactor** — extracted streaming transport, API service, and repair logic into dedicated modules under `frontend/src/context/generation/`. The React provider now owns only UI state; transport and retry logic live in `generationApiService`, `repairService`, and `streamingTransport`.
- **`StreamingState` re-exported** — backward-compatible type alias preserved in `GenerationContext.context.ts` so existing consumers (`ChatInterface`, `StreamingIndicator`) require no changes.

### Fixed
- **`onStreamingChange(false)` race** — the streaming-change callback was called unconditionally in the `finally` block of `runStreamingRequest`, which could flip `isStreaming` to `false` while a second stream was still running. Now only fires when the finishing session is the current active session.
- **Repair deduplication blocking retries** — `lastRepairErrorKey` was never reset between attempts, capping the 5-attempt repair loop at 1 in practice. Key is now cleared in `finally` so each completed attempt allows the next one to run.

## [1.8.0] - 2026-04-06

### Added
- **`AcceptanceGate.lightValidate()`** — new light-weight variant that runs structural + placeholder checks without build validation. `ModificationEngine` now uses this for pre-repair acceptance, letting `DiagnosticRepairEngine` own build validation in its repair loop.
- **4-mode modification routing** — `classifyModificationComplexity` now returns one of four explicit modes (`repair | direct | scoped | full`) with named constants (`SMALL_PROJECT_FILE_THRESHOLD = 12`, `SIMPLE_PROMPT_MAX_LENGTH = 220`) in `constants.ts`.
- **`COMPLEX_MODIFICATION_CUES` guard** — scoped routing now requires the prompt to be free of complexity cue words (refactor, rewrite, architecture, migrate, etc.), preventing AI-heavy modifications from being under-planned.
- **`ModificationRoutingDecision` exported** — the routing decision interface is now part of the public API so callers can type the result of `classifyModificationComplexity`.
- **New test files** — `acceptance-gate.test.ts` (placeholder detection, `lightValidate`, false-positive guard), `modification-engine-complexity.test.ts` (routing boundary cases), `modification-engine-routing.test.ts` (pipeline dispatch and full-mode degradation), `vitest.config.mjs`.

### Fixed
- **Scoped modification false rejection** — `changedPaths` was built with `Object.keys(deletedFiles)` where `deletedFiles` is `string[]`, producing array indices (`'0'`) as unexpected file paths. Now uses `Object.keys(updatedFiles)` only (deleted files are already included as null-value keys).
- **Scoped mode now degrades to full mode** — when a scoped or direct modification touches files outside the selected slices, instead of returning `success: false`, the engine retries with full routing (`_forceFullRouting: true`). Silent failures are eliminated.
- **`PLACEHOLDER_PATTERNS` false positives** — `/implement this file/i` and `/subsequent phases/i` patterns are now comment-anchored (`\/\/.*`) so they only fire on JS/TS comment lines, not on string values or JSX content in user apps.
- **`isAllowedSupportFile` over-permissive** — previously allowed any `.ts/.tsx/.css` file through the targeted-change guard, including existing files being unexpectedly modified. Now only permits newly-created files (not present in the original project).
- **`shouldSkipPlanning` no longer forces `skipIntent`** — explicit planning-skip override is now independent of the intent stage, so intent can still run when planning is skipped.
- **`applyParseWarnings` deduplication** — phase executor continuation calls no longer re-emit the same malformed-JSON warning from a prior chunk.

### Changed
- **`AcceptanceGate.validate()`** refactored into `structuralValidate()` (private, shared) + build validation layer, keeping the public API identical while enabling the new `lightValidate()` path.

## [1.7.0] - 2026-04-05

### Added
- **AcceptanceGate** — new abstraction (`backend/lib/core/acceptance-gate.ts`) that consolidates `ValidationPipeline.validate()` + `BuildValidator.validateAll()` + `BuildValidator.validateCrossFileReferences()` into a single `validate(files): AcceptanceResult` call. All generation and repair paths now flow through a single acceptance boundary.
- **Eval harness** — deterministic benchmark suite (`backend/lib/core/__tests__/eval/`) with fixtures, eval cases, and a harness that runs generation and modification scenarios against the acceptance gate without live AI calls. Covers generation pattern matching, cross-file reference checks, and modification scope isolation.
- **Live eval suite** — `eval:live` backend script exercises the full generation pipeline against real AI providers, reporting acceptance-gate pass rates and timing metrics.
- **Planning retry** — `GenerationPipeline.resolveArchitecturePlan()` retries planning once on schema parse failure before propagating the error. The retry prompt includes a strict "JSON only" instruction to recover from verbose AI responses.
- **Phase file-count enforcement** — multi-phase generation now throws immediately if a phase returns fewer files than planned, preventing silent partial output from reaching the acceptance gate.
- **`parseStructuredOutput` utility** — centralized JSON extraction + Zod validation with consistent error labels (`'${label} parse failed'`, `'${label} schema mismatch'`).
- **`state` error type** — new frontend error type for project-state inconsistency, with user-facing message and recovery suggestion.
- **Hybrid storage for generation saves** — `useSubmitPrompt` now writes through `hybridStorageService` (local + cloud) instead of the local-only `storageService`, so projects appear in the gallery immediately after generation for authenticated users.
- **Gallery re-sync on return** — `AppInner` re-fetches project metadata whenever the user navigates back to `/`, ensuring the gallery reflects projects saved during workspace sessions.
- **`HybridStorageService.getAllProjectMetadata` merge** — authenticated users now see both local and cloud projects merged by ID, newest-first, preventing cloud-sync lag from hiding unsyced local projects.

### Changed
- **All phase failures are now hard-fail** — previously non-scaffold phases recorded a warning and continued; they now throw immediately. A partial multi-phase output is no longer accepted.
- **Planning fallback removed** — heuristic plan fallback on planning failure has been removed. Planning failures now propagate as errors (with one retry).
- **`errorType` propagated through SSE** — `parseSSEStream` now includes `errorType` in the returned result object, and `useSubmitPrompt` prefers the server-supplied `errorType` over client-side detection.
- **`DiagnosticRepairEngine` uses `AcceptanceGate`** — repair engine receives an `AcceptanceGate` via `RepairRequest` instead of calling `buildValidator.validate()` directly.

### Fixed
- **Test suite alignment** — 22 in-branch test failures resolved: updated mocks to match `AcceptanceGate` interface (`validateAll` / `validateCrossFileReferences`), fixed `processFiles` mock shape, corrected phase-executor error message format, and aligned `errorType` assertion.

## [1.6.0] - 2026-04-04

### Security
- **X-User-Id header injection patched** — middleware now strips client-supplied `X-User-Id` from all incoming requests before any early-return path (OPTIONS, public routes, dev mode without JWT secret). Previously, an attacker could forge this header to bypass auth entirely when `SUPABASE_JWT_SECRET` was not configured.
- **UNIQUE constraints added** — `members(workspace_id, email)` prevents duplicate invite detection code from silently never firing; `organizations(admin_user_id)` prevents concurrent self-provision from creating two orgs for the same user.
- **HTML injection fixed in invite email** — `display_name`, workspace name, and org name are now HTML-escaped before interpolation into the invite email body.
- **JWKS fetch checks res.ok** — `fetchJwks` now throws on non-2xx so ES256 token verification fails closed (returns null) instead of parsing an error body.
- **nodejs runtime on org/settings route** — `crypto.ts` uses `Buffer` (Node.js builtin); added `export const runtime = 'nodejs'` to prevent Turbopack silently unregistering the route.

### Fixed
- **CORS on all auth error responses** (ISSUE-001, ISSUE-005) — `requireAuth()` and middleware 401/503 responses now include `Access-Control-Allow-Origin`.
- **OPTIONS preflight no longer 401s** (ISSUE-005b/c) — middleware passes OPTIONS requests through without auth-checking them.
- **ES256 JWT support** (ISSUE-006) — Supabase uses ES256; `verifySupabaseToken` now fetches keys from JWKS with a 5-minute cache.
- **Async route params** (ISSUE-006) — Next.js 15+ made dynamic route params a Promise; all `[orgId]`, `[wid]`, `[token]`, `[pid]` handlers updated to `await params`.
- **Node.js crypto in edge runtime** (ISSUE-007) — added `export const runtime = 'nodejs'` to routes importing from Node.js `crypto`.
- **OnboardingPage navigation** (ISSUE-002) — replaced `navigate()` in JSX render with `<Navigate>` component.
- **Fraunces font on admin/join headlines** (ISSUE-003) — added missing `font-family: var(--font-display)` to 24px+ headlines.
- **CLAUDE.md route paths** (ISSUE-004) — corrected wrong URL paths in routing docs.

### Tests
- Added `crypto.test.ts` (7 tests), `workspace-resolver.test.ts` (5 tests), and 8 new tests in `auth.test.ts` covering ES256 JWKS, requireAuth X-User-Id trust, and CORS headers on error responses.

## [1.5.0] - 2026-04-04

### Added
- **Blank Canvas Admin** — organizations can now invite members to a shared workspace where all AI generation uses the org's own API key. Admins manage invites, monitor member projects, and configure org settings from a dedicated dashboard.
- **WorkspaceContext** — frontend now carries workspace-scoped identity through generation and modification requests. When a user is in a workspace session, their API calls automatically use the org's encrypted API key rather than the default provider.
- **Member pages** — four new member-facing routes: workspace picker (choose between personal and org workspace), member builder (full app builder scoped to a workspace project), member join (accept invite flow), and onboarding (first-time workspace setup).
- **Admin pages** — dedicated admin UI: dashboard (overview of members and projects), members list (invite, remove, role management), project browser (view all member projects), org settings (rename org, rotate API key, customize labels).
- **Invite API** (`/api/invite`) — admin issues invite tokens; members redeem them to join a workspace. Tokens are single-use and time-limited.
- **Member project API** (`/api/member/projects`) — members save and load projects scoped to their workspace. Auto-save triggers after each successful generation or modification.
- **Org settings API** (`/api/org/:orgId/settings`) — admins read and update org name, custom labels, and API key. Key is encrypted at rest with AES-256-GCM before storage; the plaintext never leaves the server.
- **AES-256-GCM API key encryption** (`backend/lib/security/crypto.ts`) — org API keys encrypted with a server-side master key (`WORKSPACE_MASTER_KEY`). Decryption errors are caught and logged without propagating 500s to members.
- **Workspace provider resolution** (`backend/lib/security/workspace-resolver.ts`) — validates membership, fetches org API key, decrypts it, and returns a workspace-scoped `AIProvider`. Falls through to default provider when Supabase is not configured or org has no key set.
- **Database migration** (`supabase/migrations/20260404_add_blank_canvas_admin.sql`) — new tables: `organizations`, `workspaces`, `members`, `workspace_projects`, `workspace_project_snapshots`. Row-level security enforces org boundaries.
- **Auto-save with user feedback** (`useMemberAutoSave`) — project files save to the backend after every streaming completion. Save failures now surface a toast notification so members know their changes may not be persisted.

### Security
- **IDOR fix in snapshot upsert** — `modify-stream` snapshot now validates that the client-supplied `projectId` belongs to the authenticated `workspaceId` before writing. Previously, any workspace member could overwrite another workspace's snapshot by sending an arbitrary `projectId`.
- **Decryption error containment** — `decryptApiKey()` in workspace-resolver is now wrapped in a try-catch; corrupted or tampered ciphertext returns `null` (falls through to default provider) instead of an unhandled 500.
- **Org name update fixed** — `UpdateSettingsSchema` was missing the `name` field; `PUT /api/org/:orgId/settings` with only `name` returned a 400 "No fields to update" error and silently dropped the change. Fixed.
- **Dead import removed** — unused `extractBearerToken` import removed from `generate-stream/route.ts`.

## [1.4.0] - 2026-03-29

### Performance
- **Simple edits now use 1 AI call** — the pipeline skips intent and planning for single- or two-file changes, repair mode, and small projects (≤8 files); complex multi-file changes still run the full 3-stage pipeline
- **Modifications are faster and more reliable** — review stage removed (was a 32k-token AI call re-reading all merged files); pipeline now goes Intent → Planning → Execution
- **Less input token usage** — context files capped at 8 slices using outlines (signatures only) instead of full content; modification prompts now include the project file map for structural awareness

### Changed
- **Small files use full-replacement by default** — the AI is now told to return complete file content (`replace_file`) for files under 200 lines, instead of search/replace patches; eliminates the main class of modification match failures
- **Small projects skip the AI file planner** — for projects with ≤8 files, files are selected via keyword matching against file names instead of an AI planning call

### Added
- **Automatic fallback when edits fail** — if a search/replace operation can't find its target, the engine automatically retries with a full-file replacement; path-validated so the AI can't create new files or touch unrelated paths
- **Line numbers in file content** — primary files shown to the AI now include line numbers, improving search/replace precision for the cases where it's still used

### Removed
- Review stage from the modification pipeline (was `PipelineOrchestrator` stage 4); build validation + auto-repair cover the same ground more efficiently

### For contributors
- `classifyModificationComplexity(slices, fileCount, errorContext)` — exported function that decides whether to skip intent/planning; 10 test cases in `modification-engine-complexity.test.ts`
- `retryWithReplaceFileFallback` — path-validated: only accepts paths that were in the failed-edit set AND exist in `currentFiles`
- `runOrderedModificationPipeline` now accepts `skipIntent`/`skipPlanning` options, consistent with `runModificationPipeline`
- Removed: `ReviewOutputSchema`, `ReviewOutput`, `MAX_OUTPUT_TOKENS_REVIEW`, `MODAL_MAX_OUTPUT_TOKENS_REVIEW`, `MAX_REVIEW_CONTENT_CHARS`

### Fixed
- Word-boundary matching in heuristic file selector (was substring — `"app"` incorrectly matched `"application"`)

## [1.3.6] - 2026-03-27

### Performance
- **True one-shot execution path** — projects with ≤10 files now issue a single AI call instead of two sequential scaffold+UI calls, saving 10-20s per generation
- **Skip plan review for simple projects** — plan review AI call (4096 tokens, ~5-10s) is skipped for ≤10 file projects; complex projects (>10 files) still run full review
- **Intent→Planning latency overlap** — planning AI call fires immediately after intent resolves, with recipe selection running synchronously (<1ms) while planning is in flight; saves 2-5s
- **File summary cache** — `buildPhaseContext()` now accepts an optional `summaryCache: Map<string, FileSummary>` to avoid re-summarizing scaffold files on every phase; `executeMultiPhase()` creates the cache once and threads it through all phases
- **Remove redundant post-pipeline validation** — `validationPipeline.validate()` (incl. TypeScript syntax parsing) removed from `streaming-generator.ts`; per-phase `PhaseExecutor` already validates syntax with retry; build-fix loop is the final safety net

### Added
- `ExecutionLayer = PhaseLayer | 'oneshot'` type in `schemas.ts` — internal-only virtual layer for the one-shot execution path; kept separate from `PhaseLayerEnum` so AI planning schema is not affected
- `expectedFiles?: string[]` override on `PhaseDefinition` — enables truncation detection for the oneshot layer (files have no 'oneshot' layer in the plan)
- `getPhasePrompt('oneshot', ...)` case in `UnifiedPromptProvider` — delegates to `getExecutionGenerationSystemPrompt()` with the architecture plan, so the AI knows which files to generate
- `tokenBudgets.oneshot` set to `MAX_OUTPUT_TOKENS_GENERATION` in all prompt providers

### Fixed
- One-shot continuation prompt now lists already-generated file paths to prevent broken imports when truncation retry fires
- Oneshot prompt now passes `ArchitecturePlan` to `getExecutionGenerationSystemPrompt()` so the AI sees the planned file list; previously passed `null` causing the AI to guess the file structure
- `phase-executor.ts` now hard-fails for `oneshot` layer when zero files are generated (same guard that existed for `scaffold`)
- `streaming-generator.ts` now returns an error when all generated files have syntax errors instead of silently passing them to the build-fix loop
- `executeMultiPhase()` now invalidates summary cache entries when a file is regenerated, preventing stale summaries in cross-phase context

### Tests
- Added 15 new tests covering all 5 optimization phases: summary cache hits/misses, plan review gate (file count threshold), review stage events when skipped, abort signal stops planning, executePhase once for oneshot, multi-phase routing for >10 files, expectedFiles override, continuation prompt content, syntax-error file drop, validationPipeline not called

## [1.3.5] - 2026-03-27

### Added
- **Embedded CSS library** — `CSS_LIBRARY_BASE` (buttons, cards, forms, layout, typography, utilities) and `CSS_LIBRARY_FULL` (toasts, modals, skeletons, tabs, badges, alerts) are now verbatim-injected into generation prompts; AI copies real CSS instead of inventing it, eliminating the primary source of visual inconsistency
- **Complexity-gated CSS injection** — `getCSSLibrary(complexity)` returns BASE for simple apps and FULL for medium/complex apps, keeping simple prompts lean
- **Domain color detection** — `getDesignSystemConstants()` detects app domain (finance, recipe, todo, e-commerce, etc.) from the user prompt and injects matching primary/secondary color variables
- **Design system constants always-on** — DESIGN_SYSTEM_CONSTANTS (spacing, radius, shadow, animation tokens) injected unconditionally into all generation prompts regardless of verboseGuidance flag
- **Mobile-first responsive patterns** — `LAYOUT_FUNDAMENTALS` upgraded with fluid typography via `clamp()`, 44px touch targets, mobile nav patterns (hamburger/bottom tab), bottom sheets, and `-webkit-overflow-scrolling: touch`
- **Image handling guidance** — `REALISTIC_DATA_GUIDANCE` upgraded with aspect-ratio containers, lazy loading, `onError` fallback pattern with sibling div overlay, and avatar initials fallback

### Fixed
- **Multi-phase complexity bug** — `phase-prompts.ts` was reading `plan.complexity` which doesn't exist on `ArchitecturePlan` (always `undefined`); medium/complex multi-phase apps were silently falling back to BASE CSS only; fixed by using `detectComplexity(userPrompt)` instead

### Tests
- Added 9 new tests covering CSS library tier gating (`getCSSLibrary` simple/medium/complex), domain color detection (finance/recipe/todo), and DESIGN_SYSTEM_CONSTANTS always-on behavior (verboseGuidance true/false/default); total: 26 prompt provider tests

## [1.3.4] - 2026-03-24

### Performance
- **Self-hosted fonts** — replaced Google Fonts CDN with `@fontsource` packages (`geist-sans`, `geist-mono`, `fraunces`), eliminating a ~2950ms render-blocking external network request that was blocking First Contentful Paint
- **CSP tightened** — removed `fonts.googleapis.com` from `style-src` and `fonts.gstatic.com` from `font-src`; fonts now served from same origin

### Fixed
- **OnboardingOverlay** — replaced hardcoded `font-family: 'Fraunces'` with `var(--font-display)` CSS variable for consistency

## [1.3.3] - 2026-03-24

### Security
- **Next.js 14 → 16** — clears 4 HIGH CVEs (GHSA-ggv3-7p47-pfv8, GHSA-h25m-26qc-wcjf, GHSA-9g9p-9gw9-jx7f, GHSA-3x4c-7pq8) in the backend server
- **Auth guard on config routes** — `PUT /api/agent-config` and `PUT /api/provider-config` now require a valid Supabase JWT; returns 503 when `SUPABASE_JWT_SECRET` is not configured so callers can distinguish "not configured" from "forbidden"
- **Credential scanning** — added `.gitleaks.toml` with custom rules for OpenRouter, Modal, and Supabase keys; run `gitleaks detect` before pushing to catch secrets before they land in history
- **`.env.example` hardening** — production warning added to `SUPABASE_JWT_SECRET` explaining that omitting it leaves config routes unprotected

### Fixed
- **TypeScript strict mode** — 6 pre-existing type errors surfaced by Next.js 16's stricter compilation: incorrect `EventPriority` import source, non-existent `config.ai.*` property references, Zod v4 `.default()` type mismatch, filter/map type narrowing in pipeline orchestrator, removed non-existent `ValidationError.file` property, `Uint8Array` → `BufferSource` cast for Web Crypto API
- **`request.ip` removal** — Next.js 16 removed `NextRequest.ip`; IP extraction now falls back entirely to X-Forwarded-For with configurable proxy depth

### For contributors
- `backend/tsconfig.json` now excludes `vitest.config.ts` from Next.js type-checking (was causing false type errors in CI)
- `@types/uuid` added as devDependency (Next.js 16 resolves uuid to esm-browser entry without bundled types)

## [1.3.2] - 2026-03-23

### Changed
- **Unified prompt provider** — merged `ApiPromptProvider` and `ModalPromptProvider` into a single `UnifiedPromptProvider` class configured via `PromptProviderConfig`. API and Modal paths now share identical prompt text; only token budgets and verbose guidance flag differ. Eliminates ~350 lines of duplicated prompt logic.
- `PromptProviderFactory` simplified — `createPromptProvider('modal')` passes token budget overrides and `verboseGuidance: true`; `createPromptProvider('openrouter')` uses defaults.

### For contributors
- New `UnifiedPromptProvider` test suite (17 cases) in `backend/lib/core/prompts/__tests__/` covering API defaults, Modal overrides, verbose guidance across generation/modification/bugfix prompts, recipe dispatch, phase prompt routing, and dynamic token budgets.
- `backend/lib/core/prompts/api/` and `backend/lib/core/prompts/modal/` directories removed.

## [1.3.1] - 2026-03-22

### Added
- **Onboarding redesign** — style options renamed to Editorial, Energetic, and Polished; Next button is now disabled until a project type is selected; backdrop click closes the dialog; a brief "Starting..." state fires before generation begins so the transition feels intentional
- **Image attachment UX** — attach button shows "Maximum 5 images reached" when at the limit; submit button shows "Waiting for images to upload..." while uploads are in progress; placeholder text hints at paste/drop support
- **Mobile touch target fix** — image thumbnail remove buttons are always visible on touch devices (previously only appeared on hover)
- **Logger value redaction tightened** — sensitive key patterns (api_key, redis_url, jwt_secret, etc.) redact the entire value; string value scanning is narrowed to high-confidence patterns only (bearer tokens, JWTs), preventing false positives like "token-limit-exceeded" from being partially redacted
- **Redis rate limiter fallback** — when Redis is unavailable (error, timeout, or OOM), the rate limiter switches to an in-memory sliding window that still enforces limits; legitimate traffic continues and over-limit requests are still blocked

### Changed
- API request schemas now enforce max-length constraints: project name ≤ 200 chars, description ≤ 5,000 chars, conversation turn content ≤ 5,000 chars
- Font loading split: Geist (body/code) loads synchronously as critical CSS; Fraunces (headlines) loads asynchronously with a Georgia fallback to avoid render blocking
- Updated Content Security Policy in index.html for tighter security posture

### Removed
- `BrowserChrome` component and its associated styles and tests — removed as unused infrastructure

### For contributors
- `SENSITIVE_KEY_PATTERNS` and `SENSITIVE_VALUE_PATTERNS` separated in `logger.ts` — key-name patterns redact values entirely; value patterns are high-confidence only
- Redis rate limiter test suite rewritten: fallback tests now verify in-memory enforcement (third request blocked), not just fail-open behavior
- `OnboardingOverlay` test suite added: Next disabled state, style label names, backdrop click, skip link behavior

## [1.3.0] - 2026-03-21

### Added
- **Diagnostic repair engine** — smarter error recovery that escalates through four tiers: deterministic fixes → targeted AI (temp 0.2) → broad AI (temp 0.4) → per-file rollback. Batches all errors into single AI calls, cutting worst-case repair cost from ~48K to ~18K output tokens
- **Deterministic fixes** — zero-cost fixes for missing dependencies, broken imports, export mismatches, and unclosed syntax errors before any AI call
- **Root cause analyzer** — hybrid dependency-graph + AI analysis traces build errors back to the file that actually caused them, focusing repair on the right target
- **Diff size guard** — auto-converts modify operations to full replacements when >90% of a file changed, preventing misleading diffs at zero token cost
- **Cross-file validation** — validates import/export consistency across all project files, catching broken references before they reach the preview
- **Impact analyzer** — computes topological modification order, parallelizable tiers, and affected-but-unmodified files for dependency-aware execution
- **Ordered execution mode** — files with >3 modifications execute in dependency order with per-file validation and retry, using outlines for already-modified context
- **Checkpoint manager** — captures pre-modification file state for per-file rollback during repair escalation
- **Partial success support** — modifications that fix some files but roll back others now report `partialSuccess` with the list of rolled-back files through the full API stack
- **Richer auto-repair context** — repair prompts now include 5 lines of surrounding source code and the current attempt number, helping the AI pinpoint errors faster

### Changed
- Auto-repair now tries up to 5 attempts (was 3), giving the escalation ladder room to work through all tiers
- Modification engine routes execution: ≤3 files → single-shot, >3 files → ordered (dependency-aware)
- `ModifyProjectResponse` extended with `partialSuccess` and `rolledBackFiles` fields (shared types + both backend routes)
- Dependency graph extended with `getTopologicalOrder()` and `getTransitivelyAffected()` methods

### Removed
- `build-fixer.ts` and its tests — replaced by `DiagnosticRepairEngine`

## [1.2.0] - 2026-03-21

### Added
- **Automatic CRUD inference** — entity-based apps (blogs, task managers, contact lists, etc.) now automatically include add/edit/delete operations even when the prompt doesn't ask for them. Delete always requires confirmation. Stateless tools and games are excluded. All mutations use local state — Sandpack-compatible.
- **Multi-phase generation** — complex projects (>10 files) now generate in batched phases with cross-file context, producing more coherent code with fewer broken imports
- **Architecture planning** — AI plans the file structure, type contracts, and CSS variables before generating code; a review step catches dangling imports and missing types before execution begins
- **Live phase progress** — watch your app build phase by phase (scaffold → logic → UI → integration) with real-time SSE progress events in the chat
- **Heuristic fallback** — if AI planning fails, a deterministic plan builder takes over so generation always completes
- **Recipe phase fragments** — generation recipes (React SPA, Next.js + Prisma, etc.) now inject stack-specific guidance per phase for better fullstack output

### For contributors
- `GenerationPipeline` in `pipeline-factory.ts`: dedicated new-project pipeline, separate from `PipelineOrchestrator` (modification-only)
- `ArchitecturePlanSchema`: extended planning schema with `typeContracts`, `cssVariables`, `stateShape`, `layer` assignments, and per-file `exports`/`imports` contracts
- `batch-context-builder.ts`: data-driven cross-phase context passing (type definitions, dependency content, file summaries, CSS variables, contracts)
- `phase-executor.ts`: single-phase execution with 2-attempt retry, truncation detection, and per-phase post-validation
- `phase-prompts.ts`: distinct system prompts for scaffold, logic, UI, and integration phases with contract injection
- 3 generation eval cases (`eval.test.ts`): offline snapshot-based eval for simple, medium, and complex prompts (passing ≥70)
- Named constants: `COMPLEXITY_GATE_FILE_THRESHOLD`, `UI_BATCH_SPLIT_THRESHOLD`, `INPUT_TOKEN_SAFETY_THRESHOLD`, and per-phase token budgets in `constants.ts`

### Changed
- **Generation and modification are now separate pipelines** — new projects route through `GenerationPipeline`, modifications through `PipelineOrchestrator`
- `IPromptProvider` extended with multi-phase prompt methods (`getArchitecturePlanningPrompt()`, `getPlanReviewPrompt()`, `getPhasePrompt()`)
- `ApiPromptProvider` and `ModalPromptProvider` implement per-phase context injection

### Fixed
- Magic number duplication: threshold constants now imported from `constants.ts` rather than defined inline
- **Parser wrapped format** — incremental JSON parser now correctly extracts files from `{ files: [] }` wrapper format
- **Model IDs** — replaced invalid OpenRouter model IDs in agent-config.json with working alternatives
- **Plan review boolean coercion** — PlanReview `valid` field now correctly coerced from string to boolean
- **Modification validation scope** — modification pipeline no longer fails with "Missing package.json" for partial file updates
- **Agent config model** — updated default model to `google/gemini-2.5-flash` (gemini-2.0-flash-001 was discontinued)
- **Upload route error headers** — 500 error responses from `/api/upload` now include CORS and rate-limit headers (previously missing, causing browser CORS failures on internal errors)

## [1.1.0] - 2026-03-20

### Added
- **Recipe-based generation architecture**: Pluggable recipe system for React SPA, Next.js + Prisma, and Next.js + Supabase Auth project types
- **Fullstack prompt fragments**: NEXTJS_API_PATTERNS, DATABASE_SCHEMA_GUIDANCE, AUTH_SCAFFOLDING_GUIDANCE, FULLSTACK_STRUCTURE
- **Fragment registry**: Central registry mapping fragment keys to prompt text with startup validation
- **Feature flag**: `ENABLE_FULLSTACK_RECIPES` env var (default: false) to gate fullstack generation
- **Image upload endpoint**: POST /api/upload with magic byte validation, sharp re-encoding, Supabase Storage upload
- **Client-side image upload**: Paste/drop image support with client-side resize and preview
- **Redis rate limiter**: Redis-backed sliding window rate limiter with Lua script and fail-open fallback
- **Generation eval suite**: 5 reference prompts with weighted scoring (file count, patterns, CSS, package.json validity)
- **Fullstack preview banner**: Detects fullstack projects and shows "available after export" banner in preview
- **Console panel**: SandpackConsole toggle in preview panel for viewing console.log output
- **Smart contextual suggestions**: Next-step suggestion chips based on generated project type
- **Rich generation progress**: Pipeline stage labels enriched with plan/intent context
- **Generation summary card**: Post-generation card showing file stats, mini tree, and dependency tags
- **Enhanced onboarding wizard**: 3-step wizard (project type → features → design style) generating optimized prompts
- **Production templates**: Expanded from 8 to 22 templates across 7 categories
- **Fullstack-aware export**: ZIP export with context-aware README, .env.example, Docker Compose, .gitignore
- **Frontend tests in CI**: Added frontend test step to CI workflow
- **Pipeline stage SSE events**: Frontend now processes `pipeline-stage` SSE events as progress updates

### Changed
- `applyRateLimit` is now async (supports Redis backend)
- Intent prompt now requests `projectType` classification (spa/fullstack/fullstack-auth)
- `IntentOutputSchema` extended with optional `projectType` field
- `PlanOutputSchema` extended with optional `apiRoutes`, `databaseModels`, `authStrategy` fields
- Pipeline orchestrator selects recipe after intent stage and updates prompt provider
- `ApiPromptProvider` accepts optional recipe and delegates to `composeExecutionPrompt` when set
- Export service generates context-aware metadata based on detected project stack (Prisma, Supabase, Next.js)

### Fixed
- Prompt contradiction: replaced Inter font reference with Geist Sans in shared prompt fragments
- Removed glassmorphism mention from design system constants
- Wired requestId from route context through to pipeline orchestrator
- Fixed unnecessary `as any` casts in recipe engine and pipeline orchestrator
- Fixed CORS header handling in upload route (proper AppError propagation for CSRF 403s)
