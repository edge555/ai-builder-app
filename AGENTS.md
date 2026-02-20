# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI-powered app builder monorepo that generates web applications from natural language prompts. The system uses Google Gemini AI to generate complete React projects with live preview, code editing (Monaco), and version control.

## Monorepo Structure

Three workspaces managed via npm workspaces:
- **frontend**: React/Vite SPA with Monaco editor and Sandpack preview
- **backend**: Next.js API server handling AI generation and streaming
- **shared**: Common types, schemas (Zod), and utilities

### Frontend File Structure
```
frontend/src/
├── components/         # React components
│   ├── AppLayout/     # Main layout with sidebar/resizing
│   ├── ChatInterface/ # Chat UI with virtualization
│   ├── CodeEditor/    # Monaco editor + file tree
│   ├── PreviewPanel/  # Sandpack preview + error handling
│   └── ...
├── context/           # React Context providers
│   ├── *.context.ts   # Context interface definitions
│   └── *.tsx          # Provider implementations
├── hooks/             # Custom React hooks
├── pages/             # Route components (WelcomePage, BuilderPage)
├── services/          # Business logic
│   └── storage/       # IndexedDB persistence
├── utils/             # Utility functions
├── data/              # Static data (templates)
├── integrations/      # External API clients
└── styles/            # Global CSS

```

### Backend File Structure
```
backend/
├── app/api/           # Next.js API routes
│   ├── generate-stream/  # Initial generation
│   ├── modify-stream/    # Project modification
│   ├── plan/            # Modification planning
│   ├── diff/            # Diff calculation
│   └── export/          # ZIP export
├── lib/               # Core business logic
│   ├── ai/           # Gemini client + caching
│   ├── core/         # Generation + file processing
│   ├── analysis/     # Dependency graph + file indexing
│   ├── diff/         # Smart diff generation
│   └── utils/        # Utilities (parser, validation)
└── scripts/          # Development/testing scripts
```

### Lazy Loading Strategy

The app uses React lazy loading for code splitting:

**Lazy-Loaded Components**:
- `CodeEditorView`: Monaco editor (large bundle ~2MB)
- Heavy imports deferred until needed

**Loading Pattern**:
```tsx
const CodeEditorView = lazy(() => import('./components/CodeEditor/CodeEditorView'));

<ComponentErrorBoundary componentName="Code Editor">
  <Suspense fallback={<SkeletonLoader />}>
    <CodeEditorView />
  </Suspense>
</ComponentErrorBoundary>
```

**Benefits**:
- Faster initial page load (main bundle smaller)
- Monaco editor only loaded when entering BuilderPage
- Error boundary prevents app crash if lazy load fails
- Skeleton loaders provide visual feedback during loading

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
8. If preview errors detected, auto-repair system may trigger (see Auto-Repair Flow below)

### Auto-Repair Flow

The app includes an intelligent auto-repair system that detects and fixes preview errors:

1. **Error Detection**: `SandpackErrorListener` catches runtime errors from preview
2. **Error Aggregation**: `ErrorAggregatorProvider` collects and deduplicates errors
3. **Auto-Repair Trigger**: `AutoRepairProvider` evaluates whether to auto-repair:
   - Triggers only if: error count > 0, not already generating, not in repair phase, attempts < max (3)
   - Uses stable hooks pattern to avoid infinite effect loops
4. **Repair Request**: Sends error details + current files to `/api/modify-stream`
5. **Streaming Update**: Modified files streamed back and applied to project
6. **Status Display**: `RepairStatus` component shows phase, attempt count, and error summary
7. **Error Overlay**: `ErrorOverlay` displays repair progress in preview panel

**Key Features**:
- Automatic (no user intervention required)
- Maximum 3 repair attempts to prevent infinite loops
- Debounced error collection to avoid repairing transient errors
- Visual feedback during repair process
- Manual repair trigger available via RepairStatus component

**Implementation Files**:
- `frontend/src/context/AutoRepairContext.tsx`: Orchestrates auto-repair logic
- `frontend/src/context/ErrorAggregatorContext.tsx`: Collects and deduplicates errors
- `frontend/src/context/PreviewErrorContext.tsx`: Detects and manages preview errors
- `frontend/src/components/PreviewPanel/SandpackErrorListener.tsx`: Listens to Sandpack errors
- `frontend/src/utils/repair-prompt.ts`: Generates repair prompt from errors

### Key Backend Components

**API Routes** (`backend/app/api/`):
- `generate-stream/`: Initial project generation with streaming
- `modify-stream/`: Project modification with streaming
- `plan/`: Generate modification plan without executing
- `diff/`: Calculate diffs between versions
- `revert/`: Revert to previous version
- `export/`: Export project as ZIP

**Core Logic** (`backend/lib/`):
- `ai/gemini-client.ts`: Google Gemini API integration with streaming and caching
- `core/streaming-generator.ts`: Orchestrates SSE streaming of generated files
- `core/file-processor.ts`: Validates and processes generated files with Prettier formatting
- `analysis/dependency-graph.ts`: **Performance-optimized** dependency graph with content-based caching (152x speedup on cache hits) and O(1) import resolution
- `analysis/file-index.ts`: File indexing for modification context
- `diff/`: Smart diff generation for modifications
- `utils/incremental-json-parser.ts`: **Performance-optimized** streaming JSON parser with O(n) complexity (was O(n²)), processes 10MB in ~23ms

**Backend Performance Optimizations**:
- **Incremental JSON Parser**: Optimized from O(n²) to O(n) using single-pass character scanning instead of repeated `indexOf()` calls. Achieves 403 MB/s throughput.
- **Dependency Graph Caching**: Content-based cache using SHA-256 hash of file paths + content hashes. Cache hits provide 152x speedup (10.56ms → 0.07ms). Pre-computed path lookup map for O(1) import resolution instead of trying 8 extensions per import.
- **Gemini Client**: Context caching support for reducing API costs on repeated requests with same context

### Key Frontend Components

**Pages** (`frontend/src/pages/`):
- `WelcomePage`: Landing page with hero section, features showcase, starter templates grid, and saved projects gallery
- `BuilderPage`: Main builder interface with project routing (`/project/new` for new projects, `/project/:id` for existing)

**Context Providers** (`frontend/src/context/`):
- `ProjectContext`: Manages current project state (files, versions)
- `ChatMessagesContext`: Chat message history with split state/actions contexts
- `GenerationContext`: Tracks ongoing AI generation/modification with split state/actions contexts
- `VersionContext`: Version history and undo/redo with split state/actions contexts
- `AutoRepairProvider`: Automatic error repair system
- `PreviewErrorProvider`: Runtime error detection from preview with split state/actions contexts
- `ErrorAggregatorProvider`: Aggregates errors from multiple sources

**Performance Pattern - Split Contexts**: Major contexts use split state/actions pattern to reduce re-renders:
- `GenerationStateContext` + `GenerationActionsContext`: Separate state (changes frequently) from actions (stable callbacks)
- `PreviewErrorStateContext` + `PreviewErrorActionsContext`: Error state separate from error handlers
- Components subscribe only to what they need via dedicated hooks
- Example: `useGenerationState()` for read-only state, `useGenerationActions()` for callbacks

**Core Hooks** (`frontend/src/hooks/`):
- `useSubmitPrompt`: Handles prompt submission and streaming response
- `useAutoSave`: Automatic project persistence to IndexedDB with debouncing
- `useErrorMonitor`: Monitors and aggregates preview errors
- `usePreviewErrorHandlers`: Provides stable error handler callbacks using refs (prevents re-renders)
- `useKeyboardShortcuts`: Global keyboard shortcuts (Ctrl+Z undo, Ctrl+Y/Shift+Z redo, Ctrl+B toggle sidebar)
- `useCollapsibleMessages`: Message collapse/expand state management
- `useUndoRedo`: Version control undo/redo functionality

**Components** (`frontend/src/components/`):
- `ChatInterface/`: Chat UI with message list, collapsible messages, virtualization for 20+ messages
- `CodeEditor/`: Monaco-based code editor with file tree sidebar, virtualization for 50+ files, skeleton loading states
- `PreviewPanel/`: Sandpack preview with runtime error detection, memoized to prevent unnecessary re-renders
- `ProjectGallery/`: Saved projects browser with virtualization for 20+ projects, debounced search, sort/filter
- `TemplateGrid/`: Grid of starter templates (Analytics Dashboard, Landing Page, Task Manager, etc.) with categories
- `EditableProjectName/`: Inline editable project name component with pencil icon
- `ConfirmDialog/`: Reusable confirmation dialog for destructive actions (delete, etc.)
- `ComponentErrorBoundary/`: Generic error boundary for lazy-loaded components with retry functionality
- `AppLayout/`: Main layout wrapper with collapsible sidebar, responsive breakpoints, and header (48px height)
  - `ErrorOverlay`: Extracted sub-component that displays repair status and error count in preview panel
  - Coordinates auto-save, error monitoring, and keyboard shortcuts
  - Uses ResizablePanel pattern for sidebar drag-to-resize
- `RepairStatus/`: Visual feedback for auto-repair process (phase, attempt count, error summary)

**Performance-Optimized Components**: Following components wrapped in `React.memo` with custom comparators:
- `PreviewPanel`: Deep-compares files object, uses refs to cache transformed Sandpack files
- `ChatInterface`: Compares messages by id and content, shallow compares streaming state
- `CodeEditorView`: Deep-compares files object to prevent Monaco re-initialization
- `ProjectGallery`: Compares projects by id, updatedAt, and name

### Layout System & Responsive Design

**AppLayout Component** provides a modern, responsive two-panel layout:

**Desktop (1024px+)**:
- Collapsible chat sidebar (default: 340px, collapsed: 48px)
- Resizable sidebar (min 300px, max 60% viewport width)
- Smooth 200ms transitions for collapse/expand
- Resizer with keyboard navigation support
- Sidebar state persisted to localStorage

**Tablet (768px - 1023px)**:
- Sidebar defaults to collapsed (48px rail)
- When expanded, sidebar overlays content as fixed panel (380px, max 85vw)
- Semi-transparent backdrop with 4px blur effect
- Click backdrop or toggle button to dismiss
- Slide-in animation (200ms) for sidebar appearance

**Mobile (<768px)**:
- Full-screen panel switching (Chat/Preview tabs)
- Bottom tab bar for navigation
- Active panel takes entire viewport
- Sidebar collapse state maintained

**Keyboard Shortcuts**:
- `Ctrl+B` / `Cmd+B`: Toggle sidebar collapse/expand
- `Ctrl+Z` / `Cmd+Z`: Undo
- `Ctrl+Y` / `Ctrl+Shift+Z`: Redo

**CSS Architecture**:
- **Global Variables** (`index.css`): CSS custom properties for theming and layout
- **Component-Scoped CSS**: Each component has its own `.css` file (e.g., `ChatInterface.css`)
- **No CSS-in-JS**: Vanilla CSS for better performance and separation of concerns
- **CSS Modules**: Not used; components use BEM-like naming conventions
- **Responsive Design**: Media queries in component CSS for mobile/tablet/desktop breakpoints

**CSS Variables** (`index.css`):
- **Layout**: `--sidebar-width: 340px`, `--sidebar-collapsed-width: 48px`, `--header-height: 48px`
- **Browser Chrome**: `--chrome-bg`, `--chrome-border`, `--chrome-url-bg`
- **File Changes**: `--file-created`, `--file-modified`, `--file-deleted`
- **Messages**: `--msg-user-bg`, `--msg-ai-bg`, `--msg-error-bg`
- **Z-Index Layers**: `--z-sidebar-backdrop`, `--z-sidebar-overlay`, `--z-error-overlay`
- **Theme Colors**: Supports light/dark mode via CSS custom properties

### State Management Pattern

**Split Context Pattern** (for performance-critical contexts):
1. Define THREE contexts in `.context.ts` file:
   - `XxxStateContext`: Read-only state values that change frequently
   - `XxxActionsContext`: Stable callbacks wrapped in `useCallback`
   - `XxxContext`: Combined context (for backward compatibility)
2. Implement provider in `.tsx` file:
   - Create separate `stateValue` and `actionsValue` objects
   - Wrap all action callbacks in `useCallback` with proper dependencies
   - Provide all three contexts (state, actions, combined)
3. Export dedicated hooks:
   - `useXxxState()`: Subscribe to state only (no re-render on action changes)
   - `useXxxActions()`: Subscribe to actions only (no re-render on state changes)
   - `useXxx()`: Subscribe to both (deprecated, use sparingly)
4. Component subscribes only to what it needs

**Example - GenerationContext**:
```typescript
// State changes frequently (isGenerating, phase, progress)
export const GenerationStateContext = createContext<GenerationStateValue | null>(null);

// Actions are stable (startGeneration, stopGeneration)
export const GenerationActionsContext = createContext<GenerationActionsValue | null>(null);

// Hooks for selective subscription
export function useGenerationState() { /* ... */ }
export function useGenerationActions() { /* ... */ }
```

**Standard Context Pattern** (for simple contexts):
1. Define context interface in `.context.ts` file
2. Implement provider in corresponding `.tsx` file
3. Export both context and provider from `index.ts`
4. Wrap App in nested providers (see `App.tsx`)

**Contexts Using Split Pattern**: GenerationContext, PreviewErrorContext, ChatMessagesContext, VersionContext

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

## Key Dependencies

**Frontend**:
- `react` + `react-dom`: Core React library
- `react-router-dom`: Client-side routing
- `@codesandbox/sandpack-react`: Live preview with bundling
- `@monaco-editor/react`: Code editor component
- `@tanstack/react-virtual`: List virtualization for performance
- `lucide-react`: Icon library
- `react-markdown` + `remark-gfm`: Markdown rendering with GitHub Flavored Markdown
- `react-syntax-highlighter`: Code syntax highlighting in messages

**Backend**:
- `next`: Next.js framework for API routes
- `zod`: Schema validation
- `prettier`: Code formatting
- Google Gemini AI SDK for generation

**Shared**:
- `zod`: Schema validation shared between frontend/backend
- `tsup`: Bundle shared package for dual ESM/CJS support

## Path Aliases

Both frontend and backend use path aliases:
- `@/`: Workspace src directory
- `@/shared`: Shared package (`../shared/src`)

## Testing Strategy

- **Backend**: Vitest with Node environment, tests in `lib/**/*.test.ts`
  - Unit tests for core logic (parsing, generation, diff, formatting)
  - Performance tests for critical paths (incremental parser, dependency graph)
  - Integration tests for API routes
- **Frontend**: Vitest with jsdom + React Testing Library, tests in `src/**/*.{test,spec}.{ts,tsx}`
  - Component tests with React Testing Library
  - Hook tests for custom hooks
  - Context provider tests
  - Integration tests for key user flows
- **Shared**: Vitest with Node environment
  - Schema validation tests
  - Utility function tests

**Performance Testing**:
- `backend/scripts/verify-formatting-perf.ts`: Validates Prettier formatting performance
- Benchmark tests in `incremental-json-parser.test.ts` and `dependency-graph.test.ts`
- Performance targets documented in test files and optimization docs

## Key Design Patterns

### Core Patterns
1. **Streaming First**: All AI operations use SSE streaming for incremental updates
2. **Error Aggregation**: Errors from preview are aggregated and can trigger auto-repair
3. **Immutable Versions**: Each generation/modification creates a new immutable version
4. **Context Composition**: Heavy use of React Context for global state
5. **Type Safety**: Shared Zod schemas ensure frontend/backend contract safety
6. **Local-First Storage**: IndexedDB for client-side project persistence (no server/auth required)
7. **Template-Driven Generation**: Curated starter templates with pre-written prompts for common use cases
8. **Progressive Enhancement**: Skeleton loading states for better perceived performance
9. **Responsive Layout**: Mobile-first responsive design with collapsible sidebar, overlay panels on tablet, and full resizable layout on desktop

### Performance Patterns

**Frontend Performance**:
1. **Split Context Pattern**: Separate state and actions contexts to prevent unnecessary re-renders
   - Components subscribe only to state OR actions, not both
   - Actions wrapped in `useCallback` remain stable across renders
   - Applied to: GenerationContext, PreviewErrorContext, ChatMessagesContext, VersionContext

2. **React.memo with Custom Comparators**: Prevent expensive component re-renders
   - Deep-compare critical props (files objects) instead of shallow comparison
   - Use refs to cache transformed data and avoid recomputation
   - Applied to: PreviewPanel (Sandpack), ChatInterface, CodeEditorView (Monaco), ProjectGallery

3. **List Virtualization**: Render only visible items for large lists using `@tanstack/react-virtual`
   - ProjectGallery: Virtualizes when > 20 projects
   - ChatInterface: Virtualizes when > 20 messages
   - FileTreeSidebar: Virtualizes when > 50 files
   - Reduces DOM nodes and improves scroll performance

4. **Debounced Search**: Use `useDeferredValue` to prevent UI blocking during typing
   - Search input remains responsive (no typing lag)
   - Filter operations deferred until user stops typing
   - Visual loading indicator when search is processing

5. **Error Boundaries**: Graceful degradation for component failures
   - `ComponentErrorBoundary`: Generic boundary with retry functionality
   - `PreviewErrorBoundary`: Specialized boundary with auto-repair integration
   - Prevents app crashes when lazy-loaded components fail

6. **Stable Callbacks with Refs**: Use `useRef` to provide stable callbacks without dependencies
   - Pattern: `usePreviewErrorHandlers` hook
   - Callbacks access latest state via refs, preventing re-render cascades
   - Essential for AutoRepairProvider to avoid infinite effect loops

**Backend Performance**:
1. **O(n) Streaming Parser**: Single-pass character scanning instead of repeated string searches
   - Eliminates O(n²) complexity from `indexOf()` calls
   - Processes 10MB in ~23ms (403 MB/s throughput)
   - Memory proportional to largest file, not total response

2. **Content-Based Caching**: Cache expensive operations with deterministic keys
   - SHA-256 hash of file paths + content hashes as cache key
   - 152x speedup on cache hits for dependency graph building
   - Pre-computed lookup maps for O(1) import resolution

3. **Concurrent Processing**: Use `Promise.all()` for parallel operations where possible
   - File formatting, validation, and processing in parallel
   - Multiple API calls processed concurrently

**Key Lessons**:
- **Avoid `indexOf()` in loops**: Use state machines with single-pass scanning
- **Cache with content hashes**: Compare hash before expensive rebuild operations
- **Split contexts by update frequency**: Separate rarely-changing actions from frequently-changing state
- **Inline logic in useEffect**: Avoid function dependencies that cause unstable deps
- **Use refs for latest state in callbacks**: Prevents re-render cascades while accessing current values

### Common Performance Pitfalls to Avoid

**Frontend**:
1. **Unstable useEffect dependencies**: Functions as dependencies cause infinite loops
   - ❌ Bad: `useEffect(() => { if (shouldAutoRepair()) { ... } }, [shouldAutoRepair])`
   - ✅ Good: `useEffect(() => { if (errorCount > 0 && phase === 'error') { ... } }, [errorCount, phase])`

2. **Over-subscribing to context**: Components re-render on any context change
   - ❌ Bad: `const { state, actions } = useGeneration()` (re-renders on every state change)
   - ✅ Good: `const actions = useGenerationActions()` (only re-renders if actions change)

3. **Non-memoized expensive computations**: Same computation runs every render
   - ❌ Bad: `const sandpackFiles = transformFiles(files)` (transforms on every render)
   - ✅ Good: `const sandpackFiles = useMemo(() => transformFiles(files), [files])`

4. **Shallow comparison in React.memo**: Objects always fail shallow equality
   - ❌ Bad: `React.memo(Component)` with object props
   - ✅ Good: `React.memo(Component, (prev, next) => deepEqual(prev.files, next.files))`

5. **Rendering large lists without virtualization**: DOM nodes proportional to items
   - ❌ Bad: `{projects.map(p => <Card />)}` with 500+ projects
   - ✅ Good: Use `@tanstack/react-virtual` with conditional threshold

**Backend**:
1. **Repeated string scanning**: `indexOf()` or `slice()` in loops creates O(n²) complexity
   - ❌ Bad: `while (i < text.length) { const idx = text.indexOf(pattern, i); ... }`
   - ✅ Good: Character-by-character scanning with state machine

2. **No caching for expensive operations**: Same computation repeated with same input
   - ❌ Bad: `build(fileIndex) { this.clear(); // rebuild everything ... }`
   - ✅ Good: `build(fileIndex) { if (cacheKey === newKey) return; ... }`

3. **Synchronous CPU-intensive tasks**: Blocks event loop
   - ❌ Bad: `prettier.format()` for 50 files synchronously
   - ✅ Good: Worker pool with batching and timeouts

4. **No size limits on inputs**: Allows memory exhaustion or DOS
   - ❌ Bad: No validation on prompt length or file count
   - ✅ Good: Zod schemas with `.max()` constraints, Next.js body size limits

## Troubleshooting

### Common Issues

**Frontend Build Failures**:
- **Issue**: TypeScript errors about missing types
- **Solution**: Run `npm install` in root and ensure shared package is built: `npm run build --workspace=@ai-app-builder/shared`

**Preview Not Loading**:
- **Issue**: Sandpack shows blank screen or loading indefinitely
- **Solution**: Check browser console for errors. Common causes:
  - Missing dependencies in generated `package.json`
  - Syntax errors in generated files
  - Sandpack bundler timeout (increase timeout in PreviewPanel)

**Auto-Repair Infinite Loop**:
- **Issue**: Auto-repair keeps triggering repeatedly
- **Solution**: Check AutoRepairProvider dependencies. Ensure:
  - `shouldAutoRepair` logic is inlined in useEffect
  - No function dependencies in useEffect deps array
  - `isEvaluatingRef` is used to prevent concurrent evaluations

**Context Re-render Cascade**:
- **Issue**: Component re-renders excessively, causing performance issues
- **Solution**:
  - Use split context pattern (state + actions)
  - Subscribe only to needed context: `useXxxActions()` instead of `useXxx()`
  - Wrap callbacks in `useCallback` with correct dependencies
  - Use React DevTools Profiler to identify re-render sources

**Incremental Parser Fails**:
- **Issue**: Files not parsing from streaming response
- **Solution**: Check that response format matches expected JSON structure:
  ```json
  {"path": "src/App.tsx", "content": "..."}
  ```
  - Ensure proper brace balancing in response
  - Check for escaped quotes in file content

**Tests Failing After Optimization**:
- **Issue**: Tests fail after adding React.memo or split contexts
- **Solution**:
  - Update test mocks to provide both state and actions contexts
  - Use `waitFor` for async updates after context changes
  - Check that custom comparators in React.memo don't break test assumptions

### Development Tips

**Performance Debugging**:
1. Use React DevTools Profiler to identify slow renders
2. Check "Highlight updates when components render" in React DevTools
3. Use Performance tab in Chrome DevTools to identify event loop blocking
4. Add performance marks: `performance.mark('start')` / `performance.measure()`

**Working with Context**:
1. Always use dedicated hooks (`useXxxState`, `useXxxActions`) instead of raw context
2. When adding new context, consider split pattern if updates are frequent
3. Wrap all callbacks in `useCallback` before adding to actions context
4. Use refs for accessing latest state in stable callbacks

**Code Organization**:
1. Keep components under 200 lines (split if larger)
2. Extract sub-components when component has multiple responsibilities
3. Co-locate related files (component + CSS + tests in same directory)
4. Use barrel exports (`index.ts`) for cleaner imports

**Testing Strategy**:
1. Test hooks independently before testing components that use them
2. Mock contexts with realistic data to avoid test brittleness
3. Test error boundaries with intentionally failing components
4. Use `waitFor` for async state updates, not arbitrary timeouts
