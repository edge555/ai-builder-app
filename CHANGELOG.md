# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0] - 2026-03-21

### Added
- **Multi-phase generation pipeline** (`generation-pipeline.ts`): New orchestrator for new project generation with a complexity gate (≤10 files → one-shot, >10 files → multi-phase batched execution)
- **`ArchitecturePlanSchema`**: Extended planning schema with `typeContracts`, `cssVariables`, `stateShape`, `layer` assignments (`scaffold` | `logic` | `ui` | `integration`), and per-file `exports`/`imports` contracts
- **Plan review phase**: AI validates the architecture plan for internal consistency (dangling imports, missing type references) before execution begins
- **Heuristic fallback plan builder** (`heuristic-plan-builder.ts`): Deterministic plan construction from complexity level when AI planning fails
- **Batch context builder** (`batch-context-builder.ts`): Data-driven cross-phase context passing — provides type definitions, direct dependency content, file summaries, CSS variables, and relevant contracts to each generation phase
- **Phase executor** (`phase-executor.ts`): Single-phase execution engine with 2-attempt retry, truncation detection (continuation calls for missing files), and per-phase post-validation
- **Phase prompts** (`prompts/phase-prompts.ts`): Distinct system prompts for scaffold, logic, UI, and integration phases with contract injection
- **Phase fragments in recipes** (`recipe-types.ts`): `GenerationRecipe.phaseFragments` lets recipes inject per-phase prompt fragments for stack-specific guidance
- **Phase progress SSE events**: `phase-start` and `phase-complete` events emitted from `/api/generate-stream` and consumed by the frontend SSE parser for live phase progress display
- **3 generation eval cases** (`eval.test.ts`): Offline snapshot-based eval suite for simple (counter app), medium (todo app with search), and complex (project management with kanban + dashboard) prompts — scored with `scoreOutput()` (passing ≥70)
- **Named constants**: `COMPLEXITY_GATE_FILE_THRESHOLD`, `UI_BATCH_SPLIT_THRESHOLD`, `INPUT_TOKEN_SAFETY_THRESHOLD`, and per-phase token budget constants in `constants.ts`
- **`GenerationPipeline`** in `pipeline-factory.ts`: Dedicated factory for new-project generation, separate from `PipelineOrchestrator` (modification-only)

### Changed
- **`PipelineOrchestrator`**: Stripped of all generation logic — now handles modification pipeline only (clean separation per decision 4B)
- **`StreamingGenerator`**: Routes new-project requests through `GenerationPipeline` instead of `PipelineOrchestrator`
- **`IPromptProvider`**: Extended with `getArchitecturePlanningPrompt()`, `getPlanReviewPrompt()`, `getPhasePrompt()`, and multi-phase `tokenBudgets` fields
- **`ApiPromptProvider`** and **`ModalPromptProvider`**: Implement new multi-phase prompt methods with per-phase context injection

### Fixed
- Magic number duplication: `UI_BATCH_SPLIT_THRESHOLD` and `COMPLEXITY_GATE_FILE_THRESHOLD` now imported from `constants.ts` rather than defined inline

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
