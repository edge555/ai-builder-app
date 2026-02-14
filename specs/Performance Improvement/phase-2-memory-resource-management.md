# [ ] Phase 2: Memory & Resource Management

**Estimated effort:** 2-3 days
**Impact:** Prevents memory leaks, reduces server resource consumption, improves stability

---

## [ ] Task 2.1: Implement Gemini Cache Expiry Cleanup

**Files:**
- `backend/lib/ai/gemini-cache.ts` (lines 17-25, 64)

**Problem:**
The `cachedContentCache` Map stores cached content metadata with a 5-minute TTL, but expired entries are never removed. The map only checks `expiresAt > now` when reading, but dead entries accumulate indefinitely. After a week of heavy usage, thousands of expired entries waste memory.

**Fix:**
1. Add a `cleanup()` method that iterates the map and deletes entries where `expiresAt < Date.now()`
2. Call `cleanup()` on every `get()` call (lazy cleanup) or on a periodic timer (e.g., every 5 minutes)
3. Add `maxSize` limit to the cache map (e.g., 100 entries)
4. Log cache hit/miss rates for monitoring

**Acceptance criteria:**
- Expired entries removed within 5 minutes of expiry
- Cache size bounded to `maxSize`
- No memory growth over time from dead cache entries

---

## [ ] Task 2.2: Implement Backpressure Handling in SSE Streaming

**Files:**
- `backend/app/api/generate-stream/route.ts` (lines 78-176)
- `backend/app/api/modify-stream/route.ts`

**Problem:**
The SSE controller enqueues data via `controller.enqueue()` without checking if the client is consuming fast enough. If the client is on a slow connection, data accumulates in the response buffer without limit. There's no way to pause the Gemini stream when the client falls behind.

**Fix:**
1. Check `controller.desiredSize` before enqueuing; if <= 0, the client is behind
2. Implement a simple flow control: when desiredSize <= 0, buffer internally up to a max (e.g., 1MB)
3. If internal buffer exceeds max, pause Gemini streaming (if API supports it) or drop non-critical events
4. Add `highWaterMark` to the ReadableStream constructor for proper backpressure signaling

**Acceptance criteria:**
- Server memory bounded even with slow clients
- No data loss for critical events (files, errors)
- Heartbeat events can be safely dropped under pressure

---

## [ ] Task 2.3: Add Rate Limiting Middleware

**Files:**
- Create `backend/lib/middleware/rate-limiter.ts`
- Apply in all API routes

**Problem:**
No rate limiting exists. A single client can send unlimited requests, exhausting the Gemini API quota (typically 60 RPM). Retry logic (3 retries with 500ms base delay) compounds the problem under load.

**Fix:**
1. Implement token bucket or sliding window rate limiter
2. Limits per route: generation=5/min, modification=10/min, plan=10/min, diff=30/min
3. Return 429 Too Many Requests with `Retry-After` header
4. Add per-IP and global rate limiting
5. Store state in-memory (Map with cleanup timer) for single-instance deployment

**Acceptance criteria:**
- Requests exceeding rate limit get 429 response
- `Retry-After` header included in 429 responses
- Rate limiter cleans up expired entries periodically
- Different limits per route based on resource cost

---

## [ ] Task 2.4: Fix FilePlanner Cache Memory Issues

**Files:**
- `backend/lib/analysis/file-planner/file-planner.ts` (lines 44-46, 430-465)

**Problem:**
Two issues:
1. `chunkIndexCache` stores ChunkIndex objects (several MB each) with only count-based eviction (keeps 5). No memory-based limits.
2. `symbolLookupCache` cleanup is coupled to `chunkIndexCache` keys but could have orphaned entries if key generation differs.

**Fix:**
1. Add memory-based eviction: estimate ChunkIndex size and evict when total exceeds limit (e.g., 50MB)
2. Ensure `symbolLookupCache` uses identical key generation as `chunkIndexCache`
3. Add `clear()` method to reset both caches (useful for testing and manual cleanup)
4. Reduce max cache entries from 5 to 3 (each is several MB)

**Acceptance criteria:**
- Combined cache memory stays under 50MB
- No orphaned entries in symbolLookupCache
- Cache can be manually cleared

---

## [ ] Task 2.5: Optimize IndexedDB Storage Operations

**Files:**
- `frontend/src/services/storage/StorageService.ts` (lines 86-107, 132-161)

**Problem:**
1. `saveProject()` serializes and writes the entire project in a single IDB transaction, blocking the UI thread for large projects
2. `getAllProjects()` loads all projects into memory with no pagination
3. Chat messages stored inline in the project object, growing unbounded

**Fix:**
1. Implement chunked writes: split large projects into smaller transactions
2. Add pagination to `getAllProjects()`: accept `offset` and `limit` parameters
3. Store chat messages in a separate IDB object store with lazy loading
4. Add `getProjectMetadata()` method that returns only name/id/timestamps (no files/messages)
5. Use the metadata method for ProjectGallery listing

**Acceptance criteria:**
- Saving a 10MB project doesn't block UI for more than 100ms
- Gallery loads project list without loading full project data
- Chat messages loaded on demand when opening a project

---

## [ ] Task 2.6: Fix useAutoSave Race Condition in StrictMode

**Files:**
- `frontend/src/hooks/useAutoSave.ts` (lines 40-82)

**Problem:**
The debounce timer can fire after component unmount in React StrictMode, calling `setIsSaving(true)` on an unmounted component. This causes React warnings and potential state corruption.

**Fix:**
1. Add `isMounted` ref, set to `true` on mount, `false` on cleanup
2. Check `isMounted.current` before `setIsSaving(true)` in the setTimeout callback
3. Also guard the `finally` block's `setIsSaving(false)`

**Acceptance criteria:**
- No "setState on unmounted component" warnings in StrictMode
- Auto-save still works correctly in production mode
- Debounce timer properly cancelled on unmount

---

## [ ] Task 2.7: Optimize useUndoRedo SessionStorage Writes

**Files:**
- `frontend/src/hooks/useUndoRedo.ts` (lines 36-43)

**Problem:**
The entire undo stack (up to 20 entries of full project state) is serialized to `sessionStorage` on every state change. With average project size of 500KB, this writes 10MB of JSON on every undo/redo action.

**Fix:**
1. Debounce sessionStorage writes (e.g., 2 second delay)
2. Store only diffs instead of full snapshots
3. Or remove sessionStorage persistence entirely (undo stack is ephemeral by nature)
4. If keeping persistence, compress with a lightweight algorithm

**Acceptance criteria:**
- SessionStorage writes reduced by 90%+
- Undo/redo still works correctly after page refresh (if persistence kept)
- No UI jank during rapid undo/redo operations
