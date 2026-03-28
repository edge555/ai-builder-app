# Changelog

All notable changes to this project will be documented in this file.

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
