# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0] - 2026-03-21

### Added
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
