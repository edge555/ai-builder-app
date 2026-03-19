# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-03-19

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
