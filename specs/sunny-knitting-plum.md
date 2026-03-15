# Plan: Improve Project Modification System

## Context

The AI app builder's modification system has three key weaknesses:

1. **Fragile edits**: If one search/replace edit fails, ALL modifications are discarded and the entire generation retries from scratch.
2. **No conversation memory**: Each modification is stateless — AI has no idea what was asked or changed before.
3. **Unnecessary latency**: Every modification triggers an AI planning call (2-5s) even for trivial prompts.

**Mode**: HOLD SCOPE. **Industry research** (Cursor, Bolt, Lovable, Replit, v0) validates our approach: search/replace with fuzzy matching (Lovable), conversation context (universal), and full-file fallback for reliability (Cursor finding: full rewrites > diffs for files < 400 lines).

---

## Part 1: Partial Edit Application & Hybrid Retry

**Goal**: Apply edits that succeed, only retry the ones that failed. Use hybrid retry: search/replace first, then `replace_file` fallback.

```
modification-generator.ts (retry loop)
  ├─ Attempt 1: Full AI call → applyFileEdits()
  │   ├─ File A: all edits succeed → accumulatedUpdates['A']
  │   ├─ File B: edit #2 fails → accumulatedUpdates['B'] = partialContent
  │   │                         → failedFileEdits[{path:'B', ...}]
  │   └─ File C: create/delete → accumulatedUpdates['C']
  │
  ├─ Attempt 2: Focused search/replace retry (failed files only)
  │   └─ buildFailedEditRetryPrompt() → shows File B current content + errors
  │   └─ AI returns modify/replace_file for File B → merge
  │
  ├─ Attempts 3-4: Force replace_file for remaining failures
  │   └─ buildReplaceFileRetryPrompt() → asks AI for complete corrected file
  │   └─ AI returns replace_file → merge (most reliable)
  │
  └─ After max retries: accept accumulatedUpdates with partial edits
```

### Files to modify:

#### 1.1 `shared/src/types/edit-operation.ts`
Add per-edit detail tracking:
```typescript
export interface EditDetail {
  editIndex: number;
  success: boolean;
  matchTier?: number;  // 1-4, or 0 if no match
  warning?: string;
  error?: string;
  edit: EditOperation;
}
```
Extend `EditApplicationResult` with two new optional fields:
- `editDetails?: EditDetail[]` — per-edit success/failure info
- `partialContent?: string` — content after applying only successful edits

#### 1.2 `backend/lib/diff/multi-tier-matcher.ts`
Add `tier?: number` to `applySearchReplace` return type. Propagate from `multiTierMatch` result. One-line addition — fully backward compatible.

#### 1.3 `backend/lib/diff/edit-applicator.ts`
Change `applyEdits()` from fail-fast to continue-on-failure:
- Process ALL edits, not just until first failure
- Track `partialContent` (content with only successful edits applied)
- Build `editDetails[]` array with per-edit results
- Still return `success: false` if any edit fails, but include `partialContent` and `editDetails`
- **Decision**: Accept risk of semantically broken partial content — build validator catches syntax issues, retry fixes the gap

#### 1.4 `backend/lib/diff/file-edit-applicator.ts`
Change from early-return to continue processing:
- When a file's edits partially fail: store `partialContent` in `updatedFiles`, track in `failedFileEdits`
- Continue processing other files (don't return early)
- Return type adds: `failedFileEdits?: Array<{ path, failedEdits: EditDetail[], partialContent?, originalContent }>`

#### 1.5 `backend/lib/diff/modification-generator.ts`
Refactor retry loop for **hybrid retry strategy**:

- **Attempt 1**: Full generation (same as today)
- **Attempt 2**: Focused retry with search/replace feedback (show current content + failed edits + closest-region hints)
- **Attempts 3-4**: Request `replace_file` for remaining failed files (most reliable — industry best practice per Cursor/Bolt research)
- **After max retries**: Accept partial results (log warning)
- **Path validation on retry**: Use existing `validateFilePaths()` to ensure AI returns paths matching failed files only

#### 1.6 `backend/lib/diff/prompt-builder.ts`
Add `buildFailedEditRetryPrompt()` here (not in modification-generator.ts — **DRY decision**: all prompt construction lives in prompt-builder.ts alongside `buildModificationPrompt` and `buildBuildFixPrompt`).

#### 1.7 `backend/lib/core/prompts/shared-prompt-fragments.ts`
Add one line to SEARCH_REPLACE_GUIDANCE:
```
7. RETRY SAFETY: If you receive a retry prompt showing current file content, match your search strings against THAT content, not the original.
```

---

## Part 2: Multi-Turn Conversation Context

**Goal**: Send recent conversation history with each modification so AI has context.

**Budget**: 5 turns max, 6K chars max (~1.5K tokens). Conservative to preserve token budget for code slices.

### Files to modify:

#### 2.1 `shared/src/schemas/api.ts`
```typescript
export const ConversationTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(500),
  changeSummary: z.object({
    description: z.string().max(300),
    affectedFiles: z.array(z.string()).max(20),
  }).optional(),
});
```
Add `conversationHistory: z.array(ConversationTurnSchema).max(10).optional()` to `ModifyProjectRequestSchema`.

#### 2.2 `frontend/src/hooks/useSubmitPrompt.ts`
Add `buildConversationHistory(messages, maxTurns=5, maxChars=6000)`:
- Filter to last 5 user+assistant message pairs
- User messages: truncate content to 500 chars
- Assistant messages: extract `changeSummary.description` + `affectedFiles`
- Apply 6K char total budget
- Pass to `generation.modifyProject()` / `modifyProjectStreaming()`

#### 2.3 `frontend/src/context/GenerationContext.context.ts`
Update `modifyProject` and `modifyProjectStreaming` signatures: add optional `conversationHistory` in options.

#### 2.4 `frontend/src/context/GenerationContext.tsx`
Thread `conversationHistory` through both callbacks into the POST body.

#### 2.5 `backend/app/api/modify-stream/route.ts` + `backend/app/api/modify/route.ts`
Extract `conversationHistory` from validated body, pass to `engine.modifyProject()`.

#### 2.6 `backend/lib/diff/modification-engine.ts`
Accept `conversationHistory` in options, pass to `generateModifications()`.

#### 2.7 `backend/lib/diff/modification-generator.ts`
Accept `conversationHistory`, pass to `buildModificationPrompt()`.

#### 2.8 `backend/lib/diff/prompt-builder.ts`
Add `formatConversationContext(history)`:
```
=== CONVERSATION HISTORY (recent turns) ===

User: Add a dark mode toggle
Assistant: Modified 2 files (Header.tsx, App.css), added ThemeToggle.tsx [files: Header.tsx, App.css, ThemeToggle.tsx]

User: Make the toggle animated
Assistant: Modified 1 file (ThemeToggle.tsx) [files: ThemeToggle.tsx]
```
Insert before "User Request:" in `buildModificationPrompt`. Skip if no history.

---

## Part 3: Smart Planning Skip & Caching

**Goal**: Skip the AI planning call for obvious cases.

### Files to modify:

#### 3.1 `backend/lib/diff/modification-engine.ts`
Add `shouldSkipPlanningHeuristic(prompt, projectState)` with **two simple rules** (no regex patterns):
- **Small projects** (<= 8 files): always skip — fallback heuristic is sufficient
- **Explicit file mention**: prompt mentions an existing file/component name in the project → skip

#### 3.2 `backend/lib/analysis/file-planner/file-planner.ts`
1. **Increase chunk index cache TTL** from 60s → 300s (5 min). SHA-256 content hash ensures correctness.
2. **Add planning result cache**: Keyed by `(projectStateHash, promptHash)`, 2-min TTL. Avoids redundant planning calls on retry/auto-repair.

---

## Execution Order

| Step | Files | Depends On |
|------|-------|------------|
| 1 | `shared/src/types/edit-operation.ts` | — |
| 2 | `backend/lib/diff/multi-tier-matcher.ts` | Step 1 |
| 3 | `backend/lib/diff/edit-applicator.ts` | Steps 1-2 |
| 4 | `backend/lib/diff/file-edit-applicator.ts` | Step 3 |
| 5 | `backend/lib/diff/prompt-builder.ts` | — |
| 6 | `backend/lib/diff/modification-generator.ts` | Steps 4-5 |
| 7 | `backend/lib/core/prompts/shared-prompt-fragments.ts` | — |
| 8 | `shared/src/schemas/api.ts` | — |
| 9 | `frontend/src/hooks/useSubmitPrompt.ts` | Step 8 |
| 10 | `frontend/src/context/GenerationContext.context.ts` | Step 8 |
| 11 | `frontend/src/context/GenerationContext.tsx` | Step 10 |
| 12 | `backend/app/api/modify-stream/route.ts` | Step 8 |
| 13 | `backend/app/api/modify/route.ts` | Step 8 |
| 14 | `backend/lib/diff/modification-engine.ts` | Steps 6, 8 |
| 15 | `backend/lib/analysis/file-planner/file-planner.ts` | — |

---

## Tests

### Required test files:
| Test file | Codepaths covered |
|-----------|-------------------|
| `backend/lib/diff/__tests__/edit-applicator.test.ts` | A1-A5: partial edit success/failure combinations |
| `backend/lib/diff/__tests__/file-edit-applicator.test.ts` | B1-B5: multi-file partial success, failedFileEdits |
| `backend/lib/diff/__tests__/modification-generator.test.ts` | C1-C7: focused retry, hybrid strategy, max retries |
| `backend/lib/diff/__tests__/prompt-builder.test.ts` | E1-E3, F1-F3: buildConversationHistory, formatConversationContext |
| `frontend/src/hooks/__tests__/useSubmitPrompt.test.ts` | E1-E5: buildConversationHistory (pure function, extract and test separately) |

### Integration Tests
```bash
npm run test --workspace=@ai-app-builder/backend
npm run test --workspace=frontend
npm run build
```

### Manual E2E
1. `npm run dev`
2. Create project → modify with simple prompt → verify planning skipped (backend logs)
3. Modify with complex prompt → verify planning runs
4. Multiple modifications → verify conversation context in backend logs
5. Trigger partial failure → verify partial results applied + focused retry

---

## Files Changed Summary

| # | File | Part | Change size |
|---|------|------|-------------|
| 1 | `shared/src/types/edit-operation.ts` | 1 | Small (add interface + 2 fields) |
| 2 | `shared/src/schemas/api.ts` | 2 | Small (add schema + 1 field) |
| 3 | `backend/lib/diff/multi-tier-matcher.ts` | 1 | Tiny (add `tier` to return) |
| 4 | `backend/lib/diff/edit-applicator.ts` | 1 | Medium (refactor loop logic) |
| 5 | `backend/lib/diff/file-edit-applicator.ts` | 1 | Medium (remove early return, add tracking) |
| 6 | `backend/lib/diff/modification-generator.ts` | 1+2 | Large (hybrid retry loop) |
| 7 | `backend/lib/diff/prompt-builder.ts` | 1+2 | Medium (2 new functions) |
| 8 | `backend/lib/diff/modification-engine.ts` | 2+3 | Medium (threading + heuristic) |
| 9 | `backend/lib/core/prompts/shared-prompt-fragments.ts` | 1 | Tiny (1 line) |
| 10 | `backend/lib/analysis/file-planner/file-planner.ts` | 3 | Small (TTL + cache) |
| 11 | `backend/app/api/modify-stream/route.ts` | 2 | Tiny (extract + pass field) |
| 12 | `backend/app/api/modify/route.ts` | 2 | Tiny (extract + pass field) |
| 13 | `frontend/src/hooks/useSubmitPrompt.ts` | 2 | Small (build history + pass) |
| 14 | `frontend/src/context/GenerationContext.context.ts` | 2 | Tiny (update signatures) |
| 15 | `frontend/src/context/GenerationContext.tsx` | 2 | Small (thread through) |

**Total: 15 files** — 3 large/medium changes, 12 small/tiny threading changes.
