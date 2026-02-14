# [ ] Phase 1: Critical Fixes (Priority: Immediate)

**Estimated effort:** 1-2 days
**Impact:** Prevents crashes, data loss, and resource exhaustion in production

---

## [ ] Task 1.1: Fix SSE Stream Connection Leak on Client Disconnect

**Files:**
- `backend/app/api/generate-stream/route.ts` (lines 79-176)
- `backend/app/api/modify-stream/route.ts` (similar pattern)

**Problem:**
When a client closes the browser tab or loses connection mid-stream, the backend SSE stream continues running. Heartbeat intervals (`setInterval` at line 95) keep firing, the Gemini API call continues consuming tokens, and the 120-second timeout waits to completion. With 100 abandoned connections, that's 100 timers and 100 active Gemini streams wasting resources.

**Fix:**
1. Use `request.signal` (AbortSignal) from Next.js to detect client disconnect
2. Wire the abort signal to cancel the Gemini streaming call
3. Clear heartbeat interval immediately on abort
4. Add a `signal.addEventListener('abort', cleanup)` in the ReadableStream `start()` callback

**Acceptance criteria:**
- Heartbeat interval clears within 1s of client disconnect
- Gemini API call aborts on client disconnect
- No orphaned timers after client navigates away
- Add test: simulate client abort mid-stream

---

## [ ] Task 1.2: Fix Unbounded Buffer Accumulation in Gemini JSON Parser

**Files:**
- `backend/lib/ai/gemini-json-parser.ts` (lines 34-94, 100-109)

**Problem:**
The streaming parser accumulates all chunks via `state.buffer += chunkText` (line 40). The `trimParserBuffer()` function only clears the buffer when `braceCount === 0` AND between objects. During parsing of a large AI response (10MB+), the entire response is held in a single string variable. With concurrent requests, this multiplies.

**Fix:**
1. Implement sliding window buffer: after successfully extracting a file object, discard all buffer content before the extraction point
2. Track `lastExtractedIndex` and trim buffer after each successful file parse
3. Add a hard cap (e.g., 5MB) on buffer size with graceful error if exceeded
4. Call `trimParserBuffer()` after every file extraction, not just on heartbeat intervals

**Acceptance criteria:**
- Buffer size stays under 5MB during normal operation
- Parser correctly handles files split across chunk boundaries
- Add test: stream 50MB response and verify memory stays bounded

---

## [ ] Task 1.3: Fix Version Manager Unbounded In-Memory Storage

**Files:**
- `backend/lib/core/version-manager.ts` (lines 43-49)

**Problem:**
`versionsByProject` Map stores complete file contents for every version of every project, with no limits. Formula: `projects x versions x avg_size`. At scale: 1000 projects x 20 versions x 1MB = 20GB RAM.

**Fix:**
1. Add `MAX_VERSIONS_PER_PROJECT` constant (e.g., 50)
2. Add `MAX_PROJECTS` constant (e.g., 500)
3. Implement LRU eviction: when limits exceeded, evict oldest/least-recently-accessed projects
4. Consider storing version diffs instead of full snapshots (reduces storage by ~90%)
5. Add periodic cleanup method called from API routes

**Acceptance criteria:**
- Memory usage bounded regardless of project count
- Eviction works correctly (oldest projects evicted first)
- Add monitoring: log when eviction occurs with project count

---

## [ ] Task 1.4: Add Request Timeouts to Non-Streaming API Routes

**Files:**
- `backend/app/api/modify/route.ts`
- `backend/app/api/plan/route.ts`
- `backend/app/api/export/route.ts`
- `backend/app/api/diff/route.ts`
- `backend/app/api/revert/route.ts`

**Problem:**
These routes have no request-level timeouts. If Gemini hangs, file processing stalls, or `Promise.all()` never resolves, the request stays open indefinitely (until Next.js's default 5-minute timeout on Vercel).

**Fix:**
1. Create shared `withTimeout(promise, ms)` utility
2. Wrap each route's main logic with `AbortController` + timeout
3. Set appropriate timeouts: generation=120s, diff=30s, export=60s, plan=60s
4. Return proper 504 Gateway Timeout responses
5. Clean up any in-progress work on timeout

**Acceptance criteria:**
- All API routes have explicit timeouts
- Timeout returns 504 with descriptive error message
- Resources cleaned up on timeout (no dangling promises)

---

## [ ] Task 1.5: Fix Resize Event Listener Re-registration (60+ re-registrations/sec)

**Files:**
- `frontend/src/components/AppLayout/AppLayout.tsx` (lines 289-359)

**Problem:**
The `resize` callback depends on `windowWidth`, which changes on every window resize. This causes the `useEffect` to re-run, removing and re-adding `mousemove`/`mouseup` listeners dozens of times per second during resize. This is the single worst frontend performance issue.

**Fix:**
1. Use `useRef` for `windowWidth` instead of state dependency in `resize` callback
2. Remove `windowWidth` from `resize` callback's `useCallback` dependency array
3. Use `requestAnimationFrame` to throttle `setSidePanelWidth` calls to 60fps max
4. Consider using CSS `resize` observer or `pointer-events` instead of mousemove

**Acceptance criteria:**
- Event listeners registered once, not per-frame
- Panel resize feels smooth at 60fps
- No jank or dropped frames during resize
- CPU usage during resize drops by 90%+

---

## [ ] Task 1.6: Fix Monaco Editor Forced Remount on External Updates

**Files:**
- `frontend/src/components/CodeEditor/CodeEditorView.tsx` (lines 1-218)
- `frontend/src/components/CodeEditor/MonacoEditorWrapper.tsx` (lines 37-43)

**Problem:**
External updates (AI generation, undo/redo) trigger `setExternalUpdateKey(prev => prev + 1)`, which changes the Monaco `key` prop (`key={filePath}-${externalUpdateKey}`). This unmounts and remounts the entire Monaco editor, destroying undo history, selections, scroll position, and folding state. Monaco is a heavy component (~3MB); remounting is expensive.

**Fix:**
1. Use Monaco's `editor.setValue()` API instead of key-based remounting
2. Access the editor instance via `onMount` callback ref
3. Use `editor.pushUndoStop()` before `setValue()` to preserve undo history
4. Restore cursor position after value update
5. Remove the `externalUpdateKey` pattern entirely

**Acceptance criteria:**
- External updates don't remount Monaco
- Cursor position preserved after AI updates
- Undo history not lost on external updates
- Editor scroll position maintained

