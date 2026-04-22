# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Design System

Always read `DESIGN.md` before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.

Key rules (do not violate without approval):
- Primary color is **amber-orange #D4622A** — never use violet, indigo, or purple
- Display font is **Fraunces** (serif, italic) — for headlines ≥ 24px only
- UI font is **Geist Sans** — for all body, labels, buttons
- Code font is **Geist Mono**
- Light mode is the **default** — dark mode is fully supported via `[data-theme="dark"]`
- Do NOT use uniform `border-radius: 9999px` on buttons or cards
- Do NOT add Inter, gradient blobs, glassmorphism, or 3-column icon card patterns

In QA mode, flag any code that doesn't match DESIGN.md.

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills:
- `/browse` — headless browser for QA testing, site dogfooding, and verification
- `/qa` — systematic QA testing of web applications
- `/qa-only` — QA testing without browsing setup
- `/qa-design-review` — designer's eye QA: finds and fixes visual/spacing/typography issues
- `/plan-ceo-review` — CEO/founder-mode plan review
- `/plan-eng-review` — engineering manager-mode plan review
- `/plan-design-review` — designer's eye audit of a live site (report only)
- `/review` — pre-landing PR review
- `/ship` — ship workflow (merge, test, bump version, create PR)
- `/document-release` — post-ship documentation update
- `/retro` — weekly engineering retrospective
- `/setup-browser-cookies` — import cookies from real browser into headless session

## Project Overview

AI-powered app builder monorepo that generates web applications from natural language prompts. Uses a pluggable AI provider layer (OpenRouter by default, Modal as alternative) to generate complete React projects with live preview (Sandpack), code editing (Monaco), and version control.

## Monorepo Structure

Three workspaces managed via npm workspaces:
- **frontend**: React 18/Vite SPA with Monaco editor and Sandpack preview
- **backend**: Next.js 16 API server handling AI generation and streaming
- **shared**: Common types, Zod schemas, and utilities (dual ESM/CJS via tsup)

Additionally: `supabase/` (edge functions + config), `modal-code-ai/` (Python Modal app).

### Frontend Structure
```
frontend/src/
├── components/         # 38 component directories
│   ├── AppLayout/     # Main layout (ChatPanel, PreviewSection, ResizablePanel, ErrorOverlay)
│   ├── AuthGuard/     # Route protection for authenticated routes
│   ├── ChatInterface/ # Chat UI with virtualization + MessageItem + GenerationSummaryCard
│   ├── CodeEditor/    # Monaco editor + file tree sidebar
│   ├── PreviewPanel/  # Sandpack preview + error handling + FullstackBanner + console
│   ├── ProjectGallery/# Saved projects with virtualization
│   ├── SiteHeader/    # Global header with theme toggle
│   ├── UserMenu/      # Authenticated user menu
│   └── ...            # StreamingIndicator, QuickActions, StatusIndicator, PanelToggle,
│                      #   TemplateGrid, ConfirmDialog, ErrorBoundary, UndoRedoButtons, etc.
├── context/           # React Context providers (split state/actions pattern)
│   ├── generation/    # GenerationContext service modules: generationApiService (API calls +
│   │                  #   streaming), repairService (auto-repair retry), streamingTransport
│   │                  #   (SSE lifecycle + snapshot normalization), types
│   └── AuthContext, ProjectContext, GenerationContext, ChatMessagesContext,
│       PreviewErrorContext, AutoRepairContext, ErrorAggregatorContext, ToastContext,
│       WorkspaceContext (workspace-scoped identity + AI provider injection)
├── hooks/             # Custom hooks (useSubmitPrompt, useAutoSave, useUndoRedo,
│                      #   useCountdown, useSidebarResize, useCollapsibleMessages,
│                      #   useMemberAutoSave (workspace project auto-save with toast on failure), etc.)
├── pages/             # WelcomePage, BuilderPage, LoginPage, AgentSettingsPage (lazy-loaded)
│                      # Member pages: OnboardingPage, MemberWorkspacePickerPage,
│                      #   MemberBuilderPage, MemberJoinPage
│                      # Admin pages: admin/AdminDashboardPage, admin/AdminWorkspaceListPage,
│                      #   admin/AdminWorkspacePage, admin/AdminWorkspaceCreatePage, admin/OrgSettingsPage
├── services/          # Storage, cloud, error aggregation, agent config, image-upload
│   ├── storage/       # IndexedDB abstraction (StorageService, HybridStorageService,
│   │                  #   project-store, chat-store, metadata-store, template-store)
│   └── cloud/         # CloudStorageService (Supabase integration)
├── utils/             # Logger, SSE parser, repair prompts, error messages, capture-screenshot
├── data/              # Starter templates, prompt suggestions
├── integrations/      # Backend API client config
└── styles/            # Global CSS
```

### Backend Structure
```
backend/
├── app/api/           # Next.js API routes
│   ├── generate-stream/  # Streaming generation (SSE)
│   ├── modify-stream/    # Streaming modification (SSE)
│   ├── generate/         # Non-streaming generation (gzipped JSON)
│   ├── modify/           # Non-streaming modification (gzipped JSON)
│   ├── diff/             # Diff calculation
│   ├── export/           # ZIP export
│   ├── revert/           # Version revert
│   ├── versions/         # Version listing
│   ├── health/           # Health check (?deep=true for provider probe, ?metrics=true for stats)
│   ├── upload/           # Image upload (POST, sharp re-encoding, Supabase Storage)
│   ├── agent-config/     # Per-task model config (GET/PUT)
│   ├── provider-config/  # Runtime provider override (GET/PUT)
│   ├── invite/[token]/   # Invite token redemption (GET token info, POST accept)
│   ├── member/projects/  # Member project save/load scoped to workspace (GET, POST)
│   ├── member/projects/[pid]/ # Member project by ID (GET, PUT)
│   ├── member/session/   # Member session info (GET)
│   ├── org/              # Org creation (POST)
│   ├── org/self-provision/ # Self-provision org for authenticated user (POST)
│   ├── org/[orgId]/settings/ # Org settings CRUD: name, API key, labels (GET/PUT)
│   ├── org/[orgId]/workspaces/ # Workspace listing and creation (GET/POST)
│   ├── admin/workspaces/[wid]/sessions/ # Paginated session list for admin (GET, keyset cursor)
│   ├── admin/sessions/[sessionId]/ # Full session transcript, capped at 500 msgs (GET)
│   └── admin/sessions/[sessionId]/export/ # Full JSONL export (GET)
├── lib/
│   ├── ai/            # Multi-provider AI abstraction
│   │   ├── ai-provider.ts          # AIProvider interface
│   │   ├── ai-provider-factory.ts  # Factory (reads AI_PROVIDER env + runtime override)
│   │   ├── openrouter-client.ts    # OpenRouter API client (primary)
│   │   ├── modal-client.ts         # Modal client (used by ModalPipelineFactory)
│   │   ├── modal-pipeline-factory.ts # Per-task Modal endpoint resolution (MODAL_<TASK>_URL)
│   │   ├── agent-router.ts         # Task-specific provider routing + FallbackAIProvider
│   │   ├── intent-detector.ts      # Prompt classification for model routing
│   │   ├── agent-config-store.ts   # Per-task model config persistence
│   │   ├── provider-config-store.ts# Runtime provider override persistence
│   │   ├── ai-retry.ts             # Shared retry-with-backoff logic (executeWithRetry)
│   │   └── sse-stream-processor.ts # Provider-agnostic SSE stream parsing
│   ├── core/          # Generation, validation, formatting
│   │   ├── generation-pipeline.ts  # New-project pipeline: complexity gate (≤10 files → one-shot, >10 → multi-phase batched), architecture planning, phase execution with cross-phase summary cache
│   │   ├── pipeline-orchestrator.ts # Modification-only pipeline: Intent → Planning → Execution (3 stages; review removed in v1.4.0)
│   │   ├── pipeline-factory.ts     # Wires GenerationPipeline (new) + PipelineOrchestrator (modify)
│   │   ├── phase-executor.ts       # Single-phase execution with retry + truncation continuation
│   │   ├── batch-context-builder.ts # Cross-phase context: types, deps, CSS vars, contracts
│   │   ├── heuristic-plan-builder.ts # Deterministic plan fallback when AI planning fails
│   │   ├── schemas.ts              # Zod schemas (IntentOutput, PlanOutput, ArchitecturePlanSchema, PlanReviewOutput)
│   │   ├── streaming-generator.ts  # SSE streaming orchestrator (routes new → GenerationPipeline, modify → PipelineOrchestrator)
│   │   ├── build-validator.ts      # Missing deps, broken imports, syntax errors, import/export mismatch
│   │   ├── export-service.ts       # ZIP export with fullstack-aware README, .env.example, Docker Compose
│   │   ├── file-processor.ts       # File validation + Prettier formatting + version pinning
│   │   ├── validation-pipeline.ts  # Multi-stage validation workflow
│   │   ├── validators/             # Composable validators (path, syntax, JSON, pattern, architecture)
│   │   ├── prompts/                # Provider-specific prompt assembly
│   │   │   ├── prompt-provider.ts          # IPromptProvider interface (+ multi-phase methods)
│   │   │   ├── prompt-provider-factory.ts  # Creates UnifiedPromptProvider (API or Modal config)
│   │   │   ├── unified-prompt-provider.ts  # Single configurable provider (API default; Modal: higher budgets + verbose guidance)
│   │   │   ├── generation-prompt-utils.ts  # Shared prompt building utilities
│   │   │   ├── css-library.ts              # Embedded CSS library (BASE + FULL tiers, complexity-gated)
│   │   │   ├── shared-prompt-fragments.ts  # Reusable prompt fragments (layout, polish, data, CRUD inference)
│   │   │   ├── phase-prompts.ts            # Per-phase system prompts (scaffold, logic, UI, integration)
│   │   │   └── __tests__/                  # Unit tests for UnifiedPromptProvider (26 cases)
│   │   ├── recipes/                # Pluggable generation recipes
│   │   │   ├── recipe-types.ts             # Recipe/fragment type definitions + phaseFragments
│   │   │   ├── recipe-engine.ts            # Recipe selection + prompt composition
│   │   │   ├── fragment-registry.ts        # Central fragment key → prompt text registry
│   │   │   └── fullstack-fragments.ts      # Next.js, Prisma, Supabase Auth fragments
│   │   └── version-manager.ts      # FIFO/LRU version eviction
│   ├── analysis/      # Dependency graph, impact analyzer, file indexing, AI-powered file planner
│   ├── diff/          # Modification engine (with progress callbacks), diagnostic repair engine,
│   │                  #   deterministic fixes, root-cause analyzer, checkpoint manager,
│   │                  #   diff size guard, multi-tier matcher, prompt builder
│   ├── streaming/     # SSE backpressure controller, SSEEncoder, stream-lifecycle
│   │   └── stream-lifecycle.ts     # Heartbeat, timeout, abort, cleanup management
│   ├── utils/         # Incremental JSON parser (O(n)), path security
│   ├── security/      # Rate limiting, authentication, request guards
│   │   ├── guard.ts               # applyRateLimit() + getClientIp() (rightmost-trusted IP)
│   │   ├── rate-limiter.ts        # Sliding-window rate limiter
│   │   ├── rate-limit-config.ts   # Tier configs (HIGH_COST, MEDIUM_COST, LOW_COST, CONFIG)
│   │   ├── redis-rate-limiter.ts  # Redis-backed sliding window (Lua script, fail-open fallback)
│   │   ├── auth.ts                # Supabase JWT verification + requireAuth guard (gates config mutation routes)
│   │   ├── crypto.ts              # AES-256-GCM encryption/decryption for org API keys (WORKSPACE_MASTER_KEY)
│   │   └── workspace-resolver.ts  # Validates membership, decrypts org API key, returns workspace-scoped AIProvider
│   ├── api/           # CORS, gzip, request ID, error helpers
│   │   ├── request-parser.ts       # JSON parsing + Zod validation
│   │   ├── route-context.ts        # Request ID + context logger + rate-limit header merging
│   │   ├── utils.ts                # CORS headers, CSRF origin validation, gzip, error formatting
│   │   └── zod-error.ts            # Zod error formatting
│   ├── session-service.ts # Server-side session tracking: getOrCreateSession, appendTurn (fire-and-forget), getLastKTurns
│   ├── logger.ts      # Structured logging with redaction and category filtering
│   ├── metrics.ts     # AI operation timing, token tracking, in-memory aggregate stats
│   ├── config.ts      # Zod-validated env vars with provider-aware defaults
│   └── constants.ts   # Centralized magic numbers and thresholds
└── data/              # Runtime config (agent-config.json, provider-config.json)
```

### Shared Package
```
shared/src/
├── types/     # API contracts, project state, versions, diffs, errors, plans, auth
├── schemas/   # Zod validation for all API endpoints
└── utils/     # sanitizeError(), error messages, text diff
```

## Common Commands

```bash
# Development
npm run dev                    # Start all (frontend + backend + shared watch)
npm run dev:frontend           # Frontend only (port 8080)
npm run dev:backend            # Backend only (port 4000)

# Building
npm run build                  # Build all (shared → frontend → backend)
npm run build:dev              # Frontend dev build

# Testing
npm test                       # All workspaces
npm run test --workspace=frontend
npm run test --workspace=@ai-app-builder/backend

# Linting
npm run lint                   # All workspaces
```

## Architecture Overview

### Routing

- `/`: WelcomePage — templates grid, saved projects gallery
- `/login`: LoginPage — authentication via Supabase
- `/project/new`: BuilderPage — new project (optional `?prompt=` query param)
- `/project/:id`: BuilderPage — existing project from IndexedDB
- `/settings/agents`: AgentSettingsPage — AI model/provider configuration
- `/onboarding`: OnboardingPage — first-time workspace setup for new org members
- `/w`: MemberWorkspacePickerPage — choose between personal and org workspace
- `/w/:workspaceId`: MemberBuilderPage — full builder scoped to a workspace
- `/join/:token`: MemberJoinPage — accept an org invite via token
- `/admin/:orgId`: AdminDashboardPage — overview of org members and projects
- `/admin/:orgId/workspaces`: AdminWorkspaceListPage — manage workspaces
- `/admin/:orgId/workspaces/:wid`: AdminWorkspacePage — workspace detail (members, projects)
- `/admin/:orgId/workspaces/new`: AdminWorkspaceCreatePage — create a new workspace
- `/admin/:orgId/settings`: OrgSettingsPage — rename org, rotate API key, configure labels

### Request Flow

1. User prompt → frontend ChatInterface → backend `/api/generate-stream` or `/api/modify-stream`
2. Backend resolves AI provider: if request carries a workspace identity header, `WorkspaceResolver` validates membership, decrypts the org's API key (AES-256-GCM), and returns a workspace-scoped `AIProvider`; otherwise falls through to env var / runtime override from `provider-config.json`
2a. **Session history** — `session-service.getLastKTurns()` fetches the last 10 turns (configurable via `SESSION_CONTEXT_K`) from `project_sessions` + `session_messages` and prepends them as a `[CONVERSATION HISTORY]` block in the AI system prompt. After each successful turn, `appendTurn()` records the user prompt and assistant response (fire-and-forget).
3. **New projects** → `GenerationPipeline`: intent resolves → planning fires immediately (overlapped with synchronous recipe selection) → complexity gate (≤10 files → `executeOneShot()` with 1 AI call + plan review skipped; >10 files → `executeMultiPhase()` with plan review + phase batching + cross-phase summary cache). **Modifications** → `PipelineOrchestrator`: 3-stage pipeline (Intent → Planning → Execution); intent and planning skipped automatically for simple edits (≤2 primary files) or small projects (≤8 files). On OpenRouter, `IntentDetector` + `AgentRouter` route each stage to the optimal model. On Modal, `ModalPipelineFactory` resolves per-task endpoints.
4. AI provider streams response via SSE with backpressure control (SSEEncoder utility)
5. Incremental JSON parser extracts files as they arrive
6. Files validated, formatted (Prettier), version-pinned (package.json deps), streamed back to frontend
7. Progress events emitted during modification phases (planning → generating → validating → applying)
8. Frontend updates ProjectContext → PreviewPanel (Sandpack) re-renders
9. Auto-save to IndexedDB; auto-repair triggers if preview errors detected (max 5 attempts, escalating: deterministic fixes → targeted AI → broad AI → per-file rollback)
10. `beforeunload` warning prevents accidental tab close during active generation

### AI Provider System

Multi-provider architecture with runtime switching:

- **`AIProvider` interface**: `generate()` and `generateStreaming()` — all providers implement this
- **`AIProviderFactory`**: Reads `AI_PROVIDER` env var + runtime override, returns singleton
- **OpenRouter** (default): OpenAI-compatible API with retry/backoff, structured output, SSE streaming
- **Modal**: Self-hosted models with per-task endpoint resolution via `ModalPipelineFactory` (resolves `MODAL_<TASK>_URL` → `MODAL_DEFAULT_URL`)
- **`GenerationPipeline`** (new projects): intent resolves → planning fires immediately (overlapped with synchronous recipe selection <1ms) → complexity gate (≤10 files → `executeOneShot()` single AI call, plan review skipped; >10 files → `executeMultiPhase()` with plan review + phase batching + cross-phase summary cache to avoid re-summarizing scaffold files)
- **`PipelineOrchestrator`** (modifications only): 3-stage pipeline (Intent → Planning → Execution); `classifyModificationComplexity` returns a 4-mode `ModificationRoutingDecision` (`repair | direct | scoped | full`) to decide which stages to skip and whether to enforce targeted-change scope. Scoped/direct mode degrades to full routing when unexpected files are detected. Execution is hard-fail, Intent/Planning degrade gracefully
- **`IPromptProvider`**: Abstracts system prompts, token budgets, and multi-phase prompt methods; `UnifiedPromptProvider` implements it for both providers via `PromptProviderConfig` (token budget overrides + verbose guidance flag)
- **Recipe Engine**: Pluggable generation recipes (React SPA, Next.js + Prisma, Next.js + Supabase Auth) with per-phase prompt fragments
- **`AgentRouter`** (OpenRouter only): Task-specific routing with `FallbackAIProvider` (tries models in priority order)
- **`IntentDetector`** (OpenRouter only): Classifies prompts into task types (intent, planning, coding, debugging, documentation)
- **Runtime config**: `provider-config-store.ts` persists overrides to `data/provider-config.json`; `agent-config-store.ts` persists per-task model config to `data/agent-config.json`

### Auto-Repair Flow

1. `SandpackErrorListener` catches runtime errors → `ErrorAggregatorProvider` deduplicates
2. `AutoRepairProvider` evaluates: error count > 0, not generating, attempts < 5
3. `DiagnosticRepairEngine` escalates through repair tiers:
   - **Deterministic fixes**: Missing deps, broken imports, export mismatches, unclosed syntax (zero AI cost)
   - **Targeted AI repair**: Root-cause analysis focuses repair on the causal file (temp 0.2)
   - **Broad AI repair**: Full error context sent to AI (temp 0.4)
   - **Per-file rollback**: `CheckpointManager` restores pre-modification state for unfixable files
4. Modified files streamed back; `RepairStatus` + `ErrorOverlay` show progress
5. Modifications with >3 files execute in dependency order via `ImpactAnalyzer` topological ordering

### State Management

**Split Context Pattern** (performance-critical contexts):
- Separate `XxxStateContext` (frequent changes) from `XxxActionsContext` (stable callbacks)
- Components subscribe selectively: `useXxxState()` or `useXxxActions()`
- Applied to: GenerationContext, PreviewErrorContext, ChatMessagesContext, VersionContext

**Context Providers**: ProjectContext, ChatMessagesContext, GenerationContext, AutoRepairContext, PreviewErrorContext, ErrorAggregatorContext, AuthContext, ToastContext

### Authentication

- **Supabase Auth** integration with JWT verification
- `AuthContext` (split pattern) manages auth state and actions
- `AuthGuard` component protects authenticated routes
- `LoginPage` handles sign-in flow
- Backend validates JWTs via `SUPABASE_JWT_SECRET`
- Auto-redirect to `/login` on session expiry (via `wasAuthenticatedRef` tracking in `AuthContext`)

### Storage

- **IndexedDB** via `StorageService`: Local-first project persistence (files, chat, versions, metadata)
- **Cloud storage** via `CloudStorageService`: Supabase-backed sync for authenticated users
- **HybridStorageService**: Fallback layer (local → cloud) for seamless offline/online experience; includes `getUniqueProjectName()` which deduplicates 3-word project names by cycling through DESCRIPTOR/SUFFIX word lists
- **Modular stores**: project-store, chat-store, metadata-store, template-store
- **Auto-save** with debouncing; **write coalescing** prevents race conditions (latest wins)
- CRUD: create, read, update, delete, rename, duplicate projects

### Observability

- **Structured logging** (`logger.ts`): Configurable levels (LOG_LEVEL), category filtering (LOG_CATEGORIES), text/JSON output (LOG_FORMAT), automatic sensitive field redaction, request ID correlation
- **Metrics** (`metrics.ts`): `OperationTimer` for AI operation timing, token counts, retry tracking; `recordOperation()` accumulates in-memory stats; `getMetricsSummary()` returns aggregate stats (exposed via `/api/health?metrics=true`)
- **Request ID propagation**: Generated at route entry, carried through all layers, returned in `X-Request-Id` header
- **Request logging**: `withRouteContext` logs method, path, status, and duration for every route handler response

### Security

- **Rate limiting** (`security/guard.ts`): Per-IP sliding-window rate limiter with tiered configs (HIGH_COST, MEDIUM_COST, LOW_COST, CONFIG); body size enforcement (413); `X-RateLimit-*` headers on every response; optional Redis backend (`redis-rate-limiter.ts`) with Lua-scripted sliding window and fail-open fallback
- **IP extraction**: Falls back to rightmost-trusted X-Forwarded-For IP (configurable via `TRUSTED_PROXY_DEPTH`); `request.ip` platform property no longer available in Next.js 16
- **CSRF protection**: `getCorsHeaders(request, { rejectInvalidOrigin: true })` rejects mutations with missing/invalid Origin header (infrastructure ready, not yet wired on routes)
- **Authentication**: Optional Supabase Auth with JWT verification; `AuthContext` auto-redirects to `/login` on session expiry; `requireAuth()` gates `PUT /api/agent-config` and `PUT /api/provider-config` (returns 503 when `SUPABASE_JWT_SECRET` is unset)
- **Org API key encryption** (`security/crypto.ts`): AES-256-GCM encryption for org API keys stored in Supabase; keyed from `WORKSPACE_MASTER_KEY` (base64-encoded 32 bytes); decryption errors return `null` (fall through to default provider) rather than propagating 500s
- **Workspace provider resolution** (`security/workspace-resolver.ts`): validates `workspaceId` + member session before decrypting org API key; IDOR-safe snapshot upsert in `modify-stream` validates `projectId` belongs to the requesting workspace

## Environment Variables

**Backend** (`.env`):
- `AI_PROVIDER`: `openrouter` (default) or `modal`
- `OPENROUTER_API_KEY`: OpenRouter API key (required when using openrouter)
- `MODAL_DEFAULT_URL`: Default Modal endpoint (required when using modal)
- `MODAL_DEFAULT_STREAM_URL`: Default Modal streaming endpoint (optional)
- `MODAL_<TASK>_URL` / `MODAL_<TASK>_STREAM_URL`: Per-task Modal endpoints for `INTENT`, `PLANNING`, `EXECUTION`, `BUGFIX`, `REVIEW` (optional; fall back to `MODAL_DEFAULT_URL`)
- `MAX_OUTPUT_TOKENS`: Token limit (default: 16384)
- `ALLOWED_ORIGINS`: Comma-separated CORS origins (default: http://localhost:8080)
- `LOG_LEVEL`: debug/info/warn/error (default: info)
- `LOG_FORMAT`: text/json (default: text)
- `LOG_CATEGORIES`: ai,api,core,diff,analysis,streaming
- `SUPABASE_JWT_SECRET`: JWT verification for Supabase Auth; also required for `PUT /api/agent-config` and `PUT /api/provider-config` in any publicly-reachable deployment (optional in dev)
- `WORKSPACE_MASTER_KEY`: Base64-encoded 32-byte key for AES-256-GCM encryption of org API keys; required when using Blank Canvas Admin org workspaces
- `RATE_LIMIT_ENABLED`: Enable rate limiting (default: true)
- `TRUSTED_PROXY_DEPTH`: How many rightmost X-Forwarded-For IPs to trust (default: 1)
- `REDIS_URL`: Redis connection URL for distributed rate limiting (optional; falls back to in-memory)
- `ENABLE_FULLSTACK_RECIPES`: Enable fullstack generation recipes (default: false)
- `SESSION_CONTEXT_K`: Number of prior turns injected as conversation context per AI request (default: 10, min: 1, max: 50)
- `SESSION_CONTEXT_MAX_TOKENS`: Token budget cap for session history prefix (default: 6000, min: 1000, max: 20000)

**Frontend** (`.env`):
- `VITE_API_BASE_URL`: Backend URL (default: http://localhost:4000)
- `VITE_SUPABASE_URL`: Supabase project URL (optional)
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Supabase anon key (optional)

## Key Dependencies

**Frontend**: react 18, react-router-dom 7, @codesandbox/sandpack-react, @monaco-editor/react, @tanstack/react-virtual, lucide-react, react-markdown + remark-gfm, react-syntax-highlighter, zod, @supabase/supabase-js, @stackblitz/sdk, html2canvas

**Backend**: next 16, zod, prettier, jszip, uuid, sharp, ioredis

**Shared**: zod, tsup (dual ESM/CJS build)

## Path Aliases

- `@/`: Workspace src directory (frontend: `./src/*`, backend: `./*`)
- `@/shared`: Shared package

## Testing

- **Backend**: Vitest + Node env, 115 test files in `lib/**/*.test.ts` and `app/api/__tests__/` (unit, perf, integration, eval)
- **Frontend**: Vitest + jsdom + React Testing Library, 26 test files in `src/**/__tests__/*.{test,spec}.{ts,tsx}`
- **Shared**: Vitest + Node env, 5 test files

See [TESTING_GUIDE.md](TESTING_GUIDE.md) for file naming conventions, mock patterns, and per-framework examples.

## Key Design Patterns

### Core Patterns
1. **Streaming First**: All AI operations use SSE for incremental updates
2. **Multi-Provider AI**: Pluggable providers with runtime switching and task-specific routing
3. **Immutable Versions**: Each generation/modification creates a new version
4. **Split Contexts**: Separate state from actions to minimize re-renders
5. **Type Safety**: Shared Zod schemas enforce frontend/backend contracts
6. **Local-First**: IndexedDB persistence, no server required for storage
7. **Request ID Tracing**: Unique ID per request, propagated through all layers
8. **Auto-Repair**: Automatic error detection and fix with bounded retries
9. **Authentication**: Optional Supabase Auth with JWT verification
10. **Hybrid Storage**: Local-first with optional cloud sync via Supabase

### Frontend Performance
- **Split Context Pattern**: Subscribe only to state OR actions, not both
- **React.memo with deep comparators**: PreviewPanel, ChatInterface, CodeEditorView, ProjectGallery
- **List virtualization** (`@tanstack/react-virtual`): ProjectGallery (20+), ChatInterface (20+), FileTreeSidebar (50+)
- **Lazy loading**: All pages + Monaco editor code-split with Suspense + skeleton fallbacks
- **Stable callbacks via refs**: `usePreviewErrorHandlers` prevents re-render cascades
- **Write coalescing**: StorageService deduplicates concurrent IndexedDB writes

### Backend Performance
- **O(n) streaming parser**: Single-pass character scanning (403 MB/s, 10MB in ~23ms)
- **Content-based caching**: SHA-256 hash keys for dependency graph (152x speedup on cache hits)
- **SSE backpressure**: CRITICAL events never dropped; NORMAL/LOW dropped under pressure
- **Gzip compression**: `gzipJson()` for Route Handler responses
- **Concurrent processing**: `Promise.all()` for parallel file formatting/validation

### CSS Architecture
- Vanilla CSS with BEM-like naming (no CSS-in-JS, no CSS Modules)
- Component-scoped `.css` files + global variables in `index.css`
- Light/dark theme via CSS custom properties + `data-theme` attribute
- Critical CSS inlined in `index.html` to prevent FOUC
- Responsive: mobile (<768px) → tablet (768-1023px) → desktop (1024px+)

### Layout System
- **Desktop**: Resizable chat sidebar (340px default, min 300px, max 60vw) + content area
- **Tablet**: Collapsible overlay sidebar (380px) with backdrop
- **Mobile**: Full-screen panel switching via tab bar (Chat/Preview/Code)
- **Keyboard**: Ctrl+B toggle sidebar, Ctrl+Z undo, Ctrl+Y redo

## Pitfalls to Avoid

**Frontend**:
- Don't use functions as `useEffect` deps — inline the logic with primitive deps
- Don't use `useXxx()` combined hook — prefer `useXxxState()` or `useXxxActions()`
- Don't skip `useMemo` for expensive transforms (e.g., Sandpack file conversion)
- Don't use bare `React.memo` with object props — provide custom deep comparator
- Don't render large lists without virtualization

**Backend**:
- Don't use `indexOf()` in loops — use state machines for O(n) scanning
- Don't rebuild cached structures without checking content hash first
- Don't run CPU-intensive tasks synchronously — use worker pool
- Don't accept unbounded inputs — validate with Zod `.max()` constraints

## Troubleshooting

- **Build failures**: Run `npm install` at root, then `npm run build --workspace=@ai-app-builder/shared`
- **Preview blank**: Check console for missing deps in generated `package.json` or syntax errors
- **Auto-repair loop**: Ensure `shouldAutoRepair` logic is inlined in useEffect, not a function dep
- **Re-render cascade**: Use split context hooks, wrap callbacks in `useCallback`, check React DevTools Profiler

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
