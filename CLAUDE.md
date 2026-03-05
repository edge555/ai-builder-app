# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered app builder monorepo that generates web applications from natural language prompts. Uses a pluggable AI provider layer (OpenRouter by default, Modal as alternative) to generate complete React projects with live preview (Sandpack), code editing (Monaco), and version control.

## Monorepo Structure

Three workspaces managed via npm workspaces:
- **frontend**: React 18/Vite SPA with Monaco editor and Sandpack preview
- **backend**: Next.js 14 API server handling AI generation and streaming
- **shared**: Common types, Zod schemas, and utilities (dual ESM/CJS via tsup)

Additionally: `supabase/` (edge functions + config), `modal-code-ai/` (Python Modal app).

### Frontend Structure
```
frontend/src/
├── components/         # 27 component directories
│   ├── AppLayout/     # Main layout (ChatPanel, PreviewSection, ResizablePanel, ErrorOverlay)
│   ├── ChatInterface/ # Chat UI with virtualization
│   ├── CodeEditor/    # Monaco editor + file tree sidebar
│   ├── PreviewPanel/  # Sandpack preview + error handling
│   ├── ProjectGallery/# Saved projects with virtualization
│   ├── SiteHeader/    # Global header with theme toggle
│   ├── ThemeToggle/   # Light/dark mode toggle
│   └── ...            # TemplateGrid, ConfirmDialog, ErrorBoundary, etc.
├── context/           # React Context providers (split state/actions pattern)
├── hooks/             # Custom hooks (useSubmitPrompt, useAutoSave, useUndoRedo, etc.)
├── pages/             # WelcomePage, BuilderPage, AgentSettingsPage (all lazy-loaded)
├── services/          # StorageService (IndexedDB), ErrorAggregator, agent-config-service
├── utils/             # Logger, SSE parser, repair prompts, error messages
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
│   ├── plan/             # Modification planning
│   ├── diff/             # Diff calculation
│   ├── export/           # ZIP export
│   ├── revert/           # Version revert
│   ├── versions/         # Version listing
│   ├── health/           # Health check
│   ├── agent-config/     # Per-task model config (GET/PUT)
│   └── provider-config/  # Runtime provider override (GET/PUT)
├── lib/
│   ├── ai/            # Multi-provider AI abstraction
│   │   ├── ai-provider.ts          # AIProvider interface
│   │   ├── ai-provider-factory.ts  # Factory (reads AI_PROVIDER env + runtime override)
│   │   ├── openrouter-client.ts    # OpenRouter API client (primary)
│   │   ├── modal-client.ts         # Modal client (alternative)
│   │   ├── agent-router.ts         # Task-specific provider routing + FallbackAIProvider
│   │   ├── intent-detector.ts      # Prompt classification for model routing
│   │   ├── agent-config-store.ts   # Per-task model config persistence
│   │   ├── provider-config-store.ts# Runtime provider override persistence
│   │   └── ai-error-utils.ts       # Error categorization and retry logic
│   ├── core/          # Generation, validation, formatting
│   │   ├── streaming-generator.ts  # SSE streaming orchestrator
│   │   ├── build-validator.ts      # Missing deps, broken imports, syntax errors, import/export mismatch
│   │   ├── file-processor.ts       # File validation + Prettier formatting + version pinning
│   │   ├── validation-pipeline.ts  # Multi-stage validation workflow
│   │   ├── validators/             # Composable validators (path, syntax, JSON, pattern, architecture)
│   │   ├── prompts/                # Provider-specific prompt assembly
│   │   └── version-manager.ts      # FIFO/LRU version eviction
│   ├── analysis/      # Dependency graph, file indexing, AI-powered file planner
│   ├── diff/          # Modification engine (with progress callbacks), multi-tier matcher, prompt builder
│   ├── streaming/     # SSE backpressure controller + SSEEncoder utility
│   ├── utils/         # Incremental JSON parser (O(n)), path security
│   ├── api/           # CORS, gzip, request ID, error helpers
│   ├── logger.ts      # Structured logging with redaction and category filtering
│   ├── metrics.ts     # AI operation timing and token tracking
│   ├── config.ts      # Zod-validated env vars with provider-aware defaults
│   └── constants.ts   # Centralized magic numbers and thresholds
└── data/              # Runtime config (agent-config.json, provider-config.json)
```

### Shared Package
```
shared/src/
├── types/     # API contracts, project state, versions, diffs, errors, plans
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
- `/project/new`: BuilderPage — new project (optional `?prompt=` query param)
- `/project/:id`: BuilderPage — existing project from IndexedDB
- `/settings/agents`: AgentSettingsPage — AI model/provider configuration

### Request Flow

1. User prompt → frontend ChatInterface → backend `/api/generate-stream` or `/api/modify-stream`
2. Backend resolves AI provider (env var or runtime override from `provider-config.json`)
3. In OpenRouter mode: `IntentDetector` classifies prompt → `AgentRouter` selects models per task type
4. AI provider streams response via SSE with backpressure control (SSEEncoder utility)
5. Incremental JSON parser extracts files as they arrive
6. Files validated, formatted (Prettier), version-pinned (package.json deps), streamed back to frontend
7. Progress events emitted during modification phases (planning → generating → validating → applying)
8. Frontend updates ProjectContext → PreviewPanel (Sandpack) re-renders
8. Auto-save to IndexedDB; auto-repair triggers if preview errors detected (max 3 attempts)

### AI Provider System

Multi-provider architecture with runtime switching:

- **`AIProvider` interface**: `generate()` and `generateStreaming()` — all providers implement this
- **`AIProviderFactory`**: Reads `AI_PROVIDER` env var + runtime override, returns singleton
- **OpenRouter** (default): OpenAI-compatible API with retry/backoff, structured output, SSE streaming
- **Modal**: Self-hosted models (e.g., Qwen) with SSE streaming
- **`AgentRouter`** (OpenRouter only): Task-specific routing with `FallbackAIProvider` (tries models in priority order)
- **`IntentDetector`** (OpenRouter only): Classifies prompts into task types (intent, planning, coding, debugging, documentation)
- **Runtime config**: `provider-config-store.ts` persists overrides to `data/provider-config.json`; `agent-config-store.ts` persists per-task model config to `data/agent-config.json`

### Auto-Repair Flow

1. `SandpackErrorListener` catches runtime errors → `ErrorAggregatorProvider` deduplicates
2. `AutoRepairProvider` evaluates: error count > 0, not generating, attempts < 3
3. Sends error details + current files to `/api/modify-stream`
4. Modified files streamed back; `RepairStatus` + `ErrorOverlay` show progress

### State Management

**Split Context Pattern** (performance-critical contexts):
- Separate `XxxStateContext` (frequent changes) from `XxxActionsContext` (stable callbacks)
- Components subscribe selectively: `useXxxState()` or `useXxxActions()`
- Applied to: GenerationContext, PreviewErrorContext, ChatMessagesContext, VersionContext

**Context Providers**: ProjectContext, ChatMessagesContext, GenerationContext, VersionContext, AutoRepairProvider, PreviewErrorProvider, ErrorAggregatorProvider

### Storage

- **IndexedDB** via `StorageService`: Local-first project persistence (files, chat, versions, metadata)
- **Auto-save** with debouncing; **write coalescing** prevents race conditions (latest wins)
- CRUD: create, read, update, delete, rename, duplicate projects

### Observability

- **Structured logging** (`logger.ts`): Configurable levels (LOG_LEVEL), category filtering (LOG_CATEGORIES), text/JSON output (LOG_FORMAT), automatic sensitive field redaction, request ID correlation
- **Metrics** (`metrics.ts`): `OperationTimer` for AI operation timing, token counts, retry tracking
- **Request ID propagation**: Generated at route entry, carried through all layers, returned in `X-Request-Id` header

## Environment Variables

**Backend** (`.env`):
- `AI_PROVIDER`: `openrouter` (default) or `modal`
- `OPENROUTER_API_KEY`: OpenRouter API key (required when using openrouter)
- `MODAL_API_URL` / `MODAL_STREAM_API_URL`: Modal endpoints (required when using modal)
- `MODAL_TIMEOUT`: Request timeout in ms (default: 900,000 — 15 min)
- `MAX_OUTPUT_TOKENS`: Token limit (default: 16384)
- `ALLOWED_ORIGINS`: Comma-separated CORS origins (default: http://localhost:8080)
- `LOG_LEVEL`: debug/info/warn/error (default: info)
- `LOG_FORMAT`: text/json (default: text)
- `LOG_CATEGORIES`: ai,api,core,diff,analysis,streaming

**Frontend** (`.env`):
- `VITE_API_BASE_URL`: Backend URL (default: http://localhost:4000)
- `VITE_SUPABASE_URL`: Supabase project URL (optional)
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Supabase anon key (optional)

## Key Dependencies

**Frontend**: react 18, react-router-dom 7, @codesandbox/sandpack-react, @monaco-editor/react, @tanstack/react-virtual, lucide-react, react-markdown + remark-gfm, react-syntax-highlighter, zod

**Backend**: next 14, zod, prettier, jszip, uuid

**Shared**: zod, tsup (dual ESM/CJS build)

## Path Aliases

- `@/`: Workspace src directory (frontend: `./src/*`, backend: `./*`)
- `@/shared`: Shared package

## Testing

- **Backend**: Vitest + Node env, 34 test files in `lib/**/*.test.ts` (unit, perf, integration)
- **Frontend**: Vitest + jsdom + React Testing Library, tests in `src/**/*.{test,spec}.{ts,tsx}`
- **Shared**: Vitest + Node env

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
