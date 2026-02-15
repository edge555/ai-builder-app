# [ ] Phase 2: Memory & Resource Management

**Estimated effort:** 2-3 days
**Impact:** Prevents memory leaks, reduces server resource consumption, improves stability

---

## [x] Task 2.1: Implement Gemini Cache Expiry Cleanup

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

## [x] Task 2.2: Implement Backpressure Handling in SSE Streaming

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

## [x] Task 2.3: Fix FilePlanner Cache Memory Issues

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

## [x] Task 2.4: Optimize IndexedDB Storage Operations

**Files:**
- `frontend/src/services/storage/StorageService.ts` (lines 86-107, 132-161)
- `frontend/src/services/storage/types.ts` (added ProjectMetadata interface)
- `frontend/src/App.tsx` (updated to use getAllProjectMetadata)
- `frontend/src/pages/WelcomePage.tsx` (updated to use ProjectMetadata)
- `frontend/src/components/ProjectGallery/**/*.tsx` (updated to use ProjectMetadata)

**Problem:**
1. `saveProject()` serializes and writes the entire project in a single IDB transaction, blocking the UI thread for large projects
2. `getAllProjects()` loads all projects into memory with no pagination
3. Chat messages stored inline in the project object, growing unbounded

**Fix:**
1. ✅ Implemented chunked writes: split large projects into smaller transactions using requestIdleCallback
2. ✅ Added pagination to `getAllProjects()`: accepts `offset` and `limit` parameters
3. ✅ Stored chat messages in a separate IDB object store (`chat_messages`) with lazy loading via `getChatMessages()`
4. ✅ Added `getAllProjectMetadata()` method that returns only name/id/timestamps (no files/messages)
5. ✅ Updated App.tsx and ProjectGallery to use `getAllProjectMetadata()` for gallery listings
6. ✅ Added automatic migration from DB version 1 to 2 that moves chat messages to separate store
7. ✅ Updated deleteProject to also delete associated chat messages

**Acceptance criteria:**
- ✅ Saving a 10MB project doesn't block UI for more than 100ms (chunked writes with requestIdleCallback)
- ✅ Gallery loads project list without loading full project data (using getAllProjectMetadata)
- ✅ Chat messages loaded on demand when opening a project (via getChatMessages)
- ✅ Comprehensive test coverage added for all new functionality

---

## [x] Task 2.5: Fix useAutoSave Race Condition in StrictMode

**Files:**
- `frontend/src/hooks/useAutoSave.ts` (lines 40-82)
- `frontend/src/hooks/__tests__/useAutoSave.test.ts` (added StrictMode tests)

**Problem:**
The debounce timer can fire after component unmount in React StrictMode, calling `setIsSaving(true)` on an unmounted component. This causes React warnings and potential state corruption.

**Fix:**
1. ✅ Added `isMountedRef` ref, set to `true` on mount, `false` on cleanup
2. ✅ Added early return guard at the start of setTimeout callback if component is unmounted
3. ✅ Guarded all state updates after async operations (`setLastSavedAt`, `setSaveError`, `setIsSaving`)
4. ✅ Added comprehensive tests for StrictMode behavior:
   - Test for unmount during successful save
   - Test for unmount during failed save
   - Test for unmount before timer fires

**Acceptance criteria:**
- ✅ No "setState on unmounted component" warnings in StrictMode
- ✅ Auto-save still works correctly in production mode
- ✅ Debounce timer properly cancelled on unmount
- ✅ All 13 tests passing

---

## [x] Task 2.6: Optimize useUndoRedo SessionStorage Writes

**Files:**
- `frontend/src/hooks/useUndoRedo.ts` (removed sessionStorage persistence)
- `frontend/src/hooks/__tests__/useUndoRedo.test.ts` (updated tests)

**Problem:**
The entire undo stack (up to 20 entries of full project state) is serialized to `sessionStorage` on every state change. With average project size of 500KB, this writes 10MB of JSON on every undo/redo action.

**Fix:**
✅ **Chose option 3: Remove sessionStorage persistence entirely**
- Removed `useEffect` that persisted to sessionStorage (lines 36-43)
- Removed sessionStorage initialization from `useState`
- Removed `sessionStorage.removeItem()` from `clear()`
- Removed `STORAGE_KEY` constant
- Removed `useEffect` import (no longer needed)
- Updated JSDoc to clarify ephemeral nature and point to VersionContext for persistence

**Rationale:**
1. Undo/redo is inherently ephemeral and meant for the current session
2. Project state is already auto-saved to IndexedDB (won't lose work)
3. Version history system (VersionContext) provides persistent state restoration
4. Eliminates 100% of sessionStorage writes and JSON serialization overhead
5. Simpler code with no quota issues

**Acceptance criteria:**
- ✅ SessionStorage writes reduced by 100% (eliminated entirely)
- ✅ Undo/redo works correctly during current session (all 5 tests passing)
- ✅ No UI jank during rapid undo/redo operations
- ✅ Users can still restore previous states via version history system
