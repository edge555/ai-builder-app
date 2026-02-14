# [ ] Phase 5: Architecture & Code Quality

**Estimated effort:** 3-5 days
**Impact:** Maintainability, developer experience, long-term scalability

---

## [ ] Task 5.1: Move Prettier Formatting to Worker Pool

**Files:**
- `backend/lib/core/file-processor.ts` (lines 50-100)

**Problem:**
`formatCode()` runs Prettier synchronously for each file. `processFiles()` uses `Promise.all()` to format all files concurrently, but Prettier is CPU-bound. For a 50-file project, this blocks the event loop for seconds. No timeout on individual Prettier operations means a malformed file can hang formatting indefinitely.

**Fix:**
1. Use `worker_threads` to run Prettier in a worker pool
2. Create a pool of 2-4 workers (match CPU cores / 2)
3. Add per-file formatting timeout (5 seconds)
4. If formatting fails or times out, return original content with a warning
5. Process files in batches of 10 instead of all at once

**Acceptance criteria:**
- Event loop not blocked during formatting
- 50-file project formats in < 5 seconds
- Individual file timeout prevents hanging
- Graceful degradation: unformatted code returned on failure

---

## [ ] Task 5.2: Optimize Incremental JSON Parser (O(n^2) -> O(n))

**Files:**
- `backend/lib/utils/incremental-json-parser.ts` (lines 20-99)

**Problem:**
`parseIncrementalFiles()` uses `text.indexOf('{"path":',  currentIndex)` in a loop. Each `indexOf` scans from `currentIndex` to end of string. For a 10MB response with 100 files, later files require scanning from deep into the string. Total work: O(n^2).

**Fix:**
1. Maintain a `currentIndex` that advances past each parsed object (already partially done)
2. After extracting a file, trim the text up to the extraction point
3. Or use a streaming tokenizer that processes character-by-character in O(n)
4. Consider using a proper streaming JSON parser library (e.g., `stream-json`)

**Acceptance criteria:**
- 10MB response with 100 files parses in < 100ms (was potentially seconds)
- Memory usage proportional to largest single file, not total response
- All existing tests pass

---

## [ ] Task 5.3: Cache Dependency Graph Between Calls

**Files:**
- `backend/lib/analysis/dependency-graph.ts` (lines 29-58)

**Problem:**
`build()` rebuilds the entire dependency graph from scratch each time. For modification planning, this is called multiple times for the same project state. Import resolution tries 8 extensions per import (8000 iterations for 100 files x 10 imports).

**Fix:**
1. Cache built graph keyed by a hash of file paths + content lengths
2. Invalidate cache when files change
3. Pre-compute extension resolution: build a lookup map of all possible resolved paths once
4. Use the lookup map for O(1) import resolution instead of O(extensions) loop

**Acceptance criteria:**
- Second `build()` call with same files returns cached result
- Import resolution is O(1) per import
- Cache invalidates correctly when files change

---

## [ ] Task 5.4: Split Large Frontend Components

**Files:**
- `frontend/src/components/AppLayout/AppLayout.tsx` (510 lines)
- `frontend/src/components/ChatInterface/ChatInterface.tsx` (455 lines)
- `frontend/src/components/PreviewPanel/PreviewPanel.tsx` (316 lines)

**Problem:**
Monolithic components mix multiple concerns: layout, state management, event handling, and rendering. AppLayout handles sidebar collapse, panel resizing, auto-save, keyboard shortcuts, and repair coordination all in one component. This makes optimization (React.memo, context splitting) difficult.

**Fix:**
1. **AppLayout** -> split into:
   - `AppLayout.tsx`: shell layout only (sidebar + main area)
   - `SidebarPanel.tsx`: sidebar collapse/expand logic
   - `ResizablePanel.tsx`: drag-to-resize logic (reusable)
   - `BuilderOrchestrator.tsx`: coordinates auto-save, repair, initial prompt
2. **ChatInterface** -> split into:
   - `ChatInterface.tsx`: message list rendering
   - `ChatInput.tsx`: input area with submit logic
   - `LoadingIndicator.tsx`: phase-based loading animation
3. **PreviewPanel** -> split into:
   - `PreviewPanel.tsx`: Sandpack wrapper
   - `PreviewToolbar.tsx`: view toggle, refresh controls
   - `ErrorDisplay.tsx`: error overlay

**Acceptance criteria:**
- No component exceeds 200 lines
- Each component has single responsibility
- All existing functionality preserved
- Easier to apply React.memo to smaller components

---

## [ ] Task 5.5: Add Input Validation & Size Limits to API Routes

**Files:**
- `backend/app/api/generate-stream/route.ts`
- `backend/app/api/modify-stream/route.ts`
- `backend/app/api/modify/route.ts`
- `backend/app/api/export/route.ts`

**Problem:**
While basic Zod validation exists, there are no limits on:
- Maximum prompt/description length (could be megabytes)
- Maximum file count in request body
- Maximum individual file size
- Maximum total request body size
- Path traversal in file paths (e.g., `../../etc/passwd`)

**Fix:**
1. Add to Zod schemas:
   - `prompt`: max 50,000 characters
   - `files`: max 200 files per project
   - `file.content`: max 500KB per file
   - `file.path`: regex validation (no `..`, no absolute paths)
2. Add Next.js body size limit in config:
   ```javascript
   api: { bodyParser: { sizeLimit: '10mb' } }
   ```
3. Validate file paths against path traversal patterns
4. Return 413 Payload Too Large for oversized requests

**Acceptance criteria:**
- Oversized prompts rejected with clear error message
- Path traversal attempts blocked
- Total request body limited to 10MB
- Individual file content limited to 500KB

---

## [ ] Task 5.6: Use Request Headers for Gemini API Key

**Files:**
- `backend/lib/ai/gemini-client.ts` (line 194)

**Problem:**
API key is passed in URL query parameter: `?key=${this.apiKey}`. This appears in:
- Server access logs
- Error stack traces
- Network monitoring tools
- Browser developer tools (if proxied)

**Fix:**
1. Move API key to `x-goog-api-key` request header (Google's recommended approach)
2. Remove key from URL
3. Verify Gemini API supports header-based authentication
4. Update `sanitizeUrl()` to no longer need key redaction

**Acceptance criteria:**
- API key not visible in any URL
- API key sent via request header only
- All Gemini API calls still authenticate correctly

---

## [ ] Task 5.7: Add Comprehensive ESLint Rules

**Files:**
- `frontend/eslint.config.js`
- `backend/.eslintrc.json`

**Problem:**
Minimal ESLint configs miss performance and quality issues:
- No `no-console` rule (dev logs leak to production)
- No import sorting
- No unused variable detection (frontend strict=false)
- No security rules on backend

**Fix:**
1. Frontend: add rules:
   - `no-console: ['warn', { allow: ['warn', 'error'] }]`
   - `@typescript-eslint/no-unused-vars: 'warn'`
   - `prefer-const: 'warn'`
   - `eqeqeq: ['error', 'always']`
2. Backend: add `eslint-plugin-security` for injection detection
3. Both: add `eslint-plugin-import` for import ordering
4. Fix all new warnings/errors

**Acceptance criteria:**
- `npm run lint` catches console.log statements
- Unused variables flagged
- Import order enforced
- No new lint errors in CI

---

## [ ] Task 5.8: Improve Streaming Error Recovery

**Files:**
- `backend/app/api/generate-stream/route.ts` (lines 80-175)
- `backend/lib/core/file-processor.ts` (lines 92-97)

**Problem:**
1. If Gemini throws after partial data is sent, client receives partial files + error. No indication of which files are complete vs incomplete.
2. Prettier errors are silently caught; client doesn't know formatting failed.
3. No "stream complete" confirmation event.

**Fix:**
1. Add `status` field to streamed file events: `{ status: 'complete' | 'partial' }`
2. Add a `stream-end` event that summarizes: total files, successful files, failed files
3. If Prettier fails, send a warning event to client (not error, since original content is used)
4. Client should show indicator for partially received files

**Acceptance criteria:**
- Client can distinguish complete vs partial files
- Stream always ends with a summary event
- Formatting failures visible to user as warnings
- No silent data loss
