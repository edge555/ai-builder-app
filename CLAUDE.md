# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI-powered app builder monorepo that generates web applications from natural language prompts. The system uses Google Gemini AI to generate complete React projects with live preview, code editing (Monaco), and version control.

## Monorepo Structure

Three workspaces managed via npm workspaces:
- **frontend**: React/Vite SPA with Monaco editor and Sandpack preview
- **backend**: Next.js API server handling AI generation and streaming
- **shared**: Common types, schemas (Zod), and utilities

## Common Commands

### Development
```bash
npm run dev                    # Start both frontend and backend
npm run dev:frontend           # Frontend only (port 8080)
npm run dev:backend            # Backend only (port 4000)
```

### Building
```bash
npm run build                  # Build frontend for production
npm run build:dev              # Build frontend in development mode
```

### Testing
```bash
npm test                       # Run all tests in all workspaces
npm run test:watch             # Watch mode (frontend only)
npm run test --workspace=frontend          # Frontend tests only
npm run test --workspace=@ai-app-builder/backend  # Backend tests only
```

### Linting
```bash
npm run lint                   # Lint all workspaces
npm run lint --workspace=frontend          # Frontend only
npm run lint --workspace=@ai-app-builder/backend  # Backend only
```

## Architecture Overview

### User Experience Flow

1. **Landing** → User lands on WelcomePage (`/`)
2. **Project Start** → User can:
   - Click "Get Started" / "New Project" for blank project
   - Select a starter template (auto-fills prompt)
   - Open a saved project from gallery
3. **Building** → User enters BuilderPage with:
   - Chat interface for prompts
   - Monaco code editor (file tree + editor)
   - Live Sandpack preview
4. **Auto-Save** → Projects automatically save to IndexedDB
5. **Project Management** → Users can:
   - Rename projects (inline editing)
   - Duplicate projects
   - Delete projects (with confirmation)
   - Return to dashboard

### Routing

The frontend uses React Router with the following routes:
- `/`: Welcome page with templates and saved projects
- `/project/new`: Create new project (optional `?prompt=` query param)
- `/project/:id`: Open existing project from IndexedDB

### Request Flow
1. User enters prompt in **frontend** ChatInterface (or selects a starter template)
2. **frontend** sends request to **backend** `/api/generate-stream` or `/api/modify-stream`
3. **backend** uses GeminiClient to stream AI responses via SSE
4. Incremental JSON parser extracts files as they arrive
5. Files are validated and processed, then streamed back to frontend
6. **frontend** updates ProjectContext and renders in PreviewPanel (Sandpack)
7. Project auto-saves to IndexedDB via `useAutoSave` hook

### Key Backend Components

**API Routes** (`backend/app/api/`):
- `generate-stream/`: Initial project generation with streaming
- `modify-stream/`: Project modification with streaming
- `plan/`: Generate modification plan without executing
- `diff/`: Calculate diffs between versions
- `revert/`: Revert to previous version
- `export/`: Export project as ZIP

**Core Logic** (`backend/lib/`):
- `ai/gemini-client.ts`: Google Gemini API integration with streaming
- `core/streaming-generator.ts`: Orchestrates SSE streaming of generated files
- `core/file-processor.ts`: Validates and processes generated files
- `analysis/`: Dependency graph and file indexing for context
- `diff/`: Smart diff generation for modifications
- `utils/incremental-json-parser.ts`: Parses streaming JSON responses

### Key Frontend Components

**Pages** (`frontend/src/pages/`):
- `WelcomePage`: Landing page with hero section, features showcase, starter templates grid, and saved projects gallery
- `BuilderPage`: Main builder interface with project routing (`/project/new` for new projects, `/project/:id` for existing)

**Context Providers** (`frontend/src/context/`):
- `ProjectContext`: Manages current project state (files, versions)
- `ChatMessagesContext`: Chat message history
- `GenerationContext`: Tracks ongoing AI generation/modification
- `VersionContext`: Version history and undo/redo
- `AutoRepairProvider`: Automatic error repair system
- `PreviewErrorProvider`: Runtime error detection from preview
- `ErrorAggregatorProvider`: Aggregates errors from multiple sources

**Core Hooks** (`frontend/src/hooks/`):
- `useSubmitPrompt`: Handles prompt submission and streaming response
- `useAutoSave`: Automatic project persistence to IndexedDB with debouncing
- `useErrorMonitor`: Monitors and aggregates preview errors
- `useKeyboardShortcuts`: Global keyboard shortcuts

**Components** (`frontend/src/components/`):
- `ChatInterface/`: Chat UI with prompt input
- `CodeEditor/`: Monaco-based code editor with file tree sidebar and skeleton loading states
- `PreviewPanel/`: Sandpack preview with runtime error detection
- `ProjectGallery/`: Saved projects browser with project cards, rename, duplicate, and delete actions
- `TemplateGrid/`: Grid of starter templates (Analytics Dashboard, Landing Page, Task Manager, etc.) with categories
- `EditableProjectName/`: Inline editable project name component with pencil icon
- `ConfirmDialog/`: Reusable confirmation dialog for destructive actions (delete, etc.)
- `AppLayout/`: Main layout wrapper for the builder interface

### State Management Pattern

All major contexts follow this pattern:
1. Define context interface in `.context.ts` file
2. Implement provider in corresponding `.tsx` file
3. Export both context and provider from `index.ts`
4. Wrap App in nested providers (see `App.tsx`)

### Storage System

**frontend** uses `storageService` (`frontend/src/services/storage/`) for:
- **IndexedDB**: Primary local storage for projects (no server required)
  - Projects are saved to browser's IndexedDB with auto-save
  - Stores project files, chat history, versions, and metadata
  - Projects indexed by ID and sorted by last modified date
- **Project Management**: CRUD operations (create, read, update, delete, rename, duplicate)
- **Auto-save**: Automatic persistence with debouncing to prevent excessive writes
- **Serialization**: Projects serialized to `StoredProject` format with timestamps

### Starter Templates System

The app includes a curated collection of starter templates (`frontend/src/data/templates.ts`) to help users quickly generate common app types:

**Available Templates**:
- **Analytics Dashboard**: Charts, metrics cards, data tables with glassmorphism effects
- **Landing Page**: Hero section, features grid, testimonials, pricing, FAQ
- **Task Manager**: Task lists, categories, completion tracking, priority indicators
- **E-Commerce Store**: Product grid, filters, shopping cart, checkout flow
- **Portfolio Website**: Projects gallery, skills, contact form
- **Social Media Feed**: Posts, comments, likes, user interactions
- **Weather App**: Location search, forecasts, conditions display
- **Blog/CMS**: Article editor, categories, rich formatting

Each template includes:
- Pre-written detailed prompt for AI generation
- Category classification (Dashboard, Marketing, Productivity, etc.)
- Icon and description for UI display

Templates are displayed on the WelcomePage and can be selected to instantly start a new project with a pre-filled prompt.

### Shared Package

The `@ai-app-builder/shared` package exports:
- TypeScript types for API contracts
- Zod schemas for validation
- Utility functions for diffs and errors
- `sanitizeError()`: Redacts sensitive data (API keys, secrets, tokens) from error messages — used by both backend and Supabase edge functions
- Built with tsup for dual ESM/CJS support

Supabase edge functions (`supabase/functions/_shared/`) import shared utilities directly from this package (e.g., `diff-utils.ts` and `error-utils.ts` delegate to `@ai-app-builder/shared`).

## Environment Variables

Copy `.env.example` to create environment files:

**Backend** (`.env` or inline):
- `GEMINI_API_KEY`: Google Gemini API key (required)
- `GEMINI_MODEL`: Model to use (default: gemini-2.5-flash)
- `CORS_ORIGIN`: Frontend URL (default: http://localhost:8080)

**Frontend** (`.env` or inline):
- `VITE_API_BASE_URL`: Backend URL (default: http://localhost:4000)
- `VITE_SUPABASE_URL`: Supabase project URL (optional, for future cloud sync)
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Supabase anon key (optional, for future cloud sync)

## Path Aliases

Both frontend and backend use path aliases:
- `@/`: Workspace src directory
- `@/shared`: Shared package (`../shared/src`)

## Testing Strategy

- **Backend**: Vitest with Node environment, tests in `lib/**/*.test.ts`
- **Frontend**: Vitest with jsdom + React Testing Library, tests in `src/**/*.{test,spec}.{ts,tsx}`
- **Shared**: Vitest with Node environment

## Key Design Patterns

1. **Streaming First**: All AI operations use SSE streaming for incremental updates
2. **Error Aggregation**: Errors from preview are aggregated and can trigger auto-repair
3. **Immutable Versions**: Each generation/modification creates a new immutable version
4. **Context Composition**: Heavy use of React Context for global state
5. **Type Safety**: Shared Zod schemas ensure frontend/backend contract safety
6. **Local-First Storage**: IndexedDB for client-side project persistence (no server/auth required)
7. **Template-Driven Generation**: Curated starter templates with pre-written prompts for common use cases
8. **Progressive Enhancement**: Skeleton loading states for better perceived performance
