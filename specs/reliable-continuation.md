# Spec: Per-Project Conversation History (Reliable Continuation)

**Branch:** `feat/reliable-continuation`
**Status:** Ready to implement — eng review complete (2026-04-14)
**Design doc:** `~/.gstack/projects/edge555-ai-builder-app/Shoaib-main-design-20260414-182419.md`
**CEO plan:** `~/.gstack/projects/edge555-ai-builder-app/ceo-plans/2026-04-14-reliable-continuation.md`

## Problem

Students say "add a button to my app" and the AI generates a completely different app. ~50% of classroom session abandonment is statefulness failures — the AI has no memory of what it previously built. The frontend sends user messages as history but not the AI's own prior output. Fix: store conversation turns server-side, inject last-K turns as context prefix into every AI call.

## Architecture Decision: Append-Only

Rolling summary + row deletion was designed but deferred. Append-only is correct for v1:
- Classroom sessions: 50-100 turns max, ~50KB per session — negligible storage
- No Edge Function, no Postgres trigger, no async failure modes
- Full transcript always available for compliance export
- Add rolling summary only if storage costs become a real concern in prod

---

## Database Schema

```sql
-- One session per (workspace, project, member). Idle >4h → new session.
CREATE TABLE project_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id),
  project_id     UUID NOT NULL REFERENCES workspace_projects(id) ON DELETE CASCADE,
  member_id      UUID NOT NULL,        -- workspace_members.id (no FK — members can be removed)
  created_at     TIMESTAMPTZ DEFAULT now(),
  last_active_at TIMESTAMPTZ DEFAULT now(),
  turn_count     INT DEFAULT 0,
  is_active      BOOLEAN DEFAULT true  -- false when closed due to idle reset
);

-- Individual turns (user + assistant pairs). Append-only — no deletion in v1.
CREATE TABLE session_messages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES project_sessions(id) ON DELETE CASCADE,
  role               TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content            TEXT NOT NULL,
  files_affected     JSONB,            -- filenames actually generated/modified (NOT full project)
  repair_triggered   BOOLEAN DEFAULT false,
  repair_explanation TEXT,
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- Only one active session per (workspace, project, member) at a time
CREATE UNIQUE INDEX ON project_sessions (workspace_id, project_id, member_id)
  WHERE is_active = true;

CREATE INDEX ON project_sessions (workspace_id, project_id, member_id);
CREATE INDEX ON session_messages (session_id, created_at);

-- GIN index for future full-text search. Write overhead ~5-10% on INSERT.
CREATE INDEX ON session_messages USING gin(to_tsvector('english', content));
```

**RLS policies (add to migration):**
```sql
-- project_sessions: service role writes, member reads own workspace
ALTER TABLE project_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON project_sessions
  FOR ALL TO service_role USING (true);
CREATE POLICY "member_read_own_workspace" ON project_sessions
  FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

-- session_messages: service role writes, member reads via session join
ALTER TABLE session_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON session_messages
  FOR ALL TO service_role USING (true);
CREATE POLICY "member_read_own_sessions" ON session_messages
  FOR SELECT TO authenticated
  USING (session_id IN (
    SELECT id FROM project_sessions
    WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  ));
```

---

## New File: `backend/lib/session-service.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
const DEFAULT_MAX_TOKENS = 6000; // ~24,000 chars
const CHARS_PER_TOKEN = 4;

export interface SessionTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AppendTurnOptions {
  filesAffected?: string[];
  repairTriggered?: boolean;
  repairExplanation?: string;
}

// Returns sessionId, or null on failure (caller must handle null gracefully)
export async function getOrCreateSession(
  workspaceId: string,
  projectId: string,
  memberId: string
): Promise<string | null> {
  const supabase = getServiceClient();

  try {
    // Check for existing active session
    const { data: existing, error } = await supabase
      .from('project_sessions')
      .select('id, last_active_at')
      .match({ workspace_id: workspaceId, project_id: projectId, member_id: memberId, is_active: true })
      .maybeSingle();

    if (error) throw error;

    if (existing) {
      const idleMs = Date.now() - new Date(existing.last_active_at).getTime();
      if (idleMs > IDLE_TIMEOUT_MS) {
        // Mark old session inactive
        await supabase
          .from('project_sessions')
          .update({ is_active: false })
          .eq('id', existing.id);
        return await createSession(supabase, workspaceId, projectId, memberId);
      }
      // Update last_active_at
      await supabase
        .from('project_sessions')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', existing.id);
      return existing.id;
    }

    // No active session — create one
    return await createSession(supabase, workspaceId, projectId, memberId);

  } catch (err) {
    // Handle unique_violation from concurrent INSERT race
    if ((err as any)?.code === '23505') {
      // Another request created the session concurrently — fetch it
      const { data } = await supabase
        .from('project_sessions')
        .select('id')
        .match({ workspace_id: workspaceId, project_id: projectId, member_id: memberId, is_active: true })
        .maybeSingle();
      return data?.id ?? null;
    }
    console.error('[session-service] getOrCreateSession failed:', err);
    return null;
  }
}

// Returns last K turns as context prefix, token-bounded.
// IMPORTANT: call this BEFORE appendTurn(user) to avoid duplicating the current message.
export async function getLastKTurns(
  sessionId: string,
  maxTokens: number = DEFAULT_MAX_TOKENS
): Promise<SessionTurn[]> {
  const supabase = getServiceClient();

  try {
    // Fetch recent turns (generous limit — we'll token-truncate below)
    const { data: rows, error } = await supabase
      .from('session_messages')
      .select('role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    if (!rows || rows.length === 0) return [];

    // Token-budget truncation: rows is DESC (newest first). Iterate newest-first
    // so that when the budget runs out we drop the oldest turns, not the most recent.
    let tokenBudget = maxTokens;
    const selected: SessionTurn[] = [];

    for (const row of rows) { // newest-first (DESC order)
      const tokenEstimate = Math.ceil(row.content.length / CHARS_PER_TOKEN);
      if (tokenBudget - tokenEstimate < 0) break;
      tokenBudget -= tokenEstimate;
      selected.push({ role: row.role as 'user' | 'assistant', content: row.content });
    }

    // Reverse to restore chronological order for the AI prompt.
    return selected.reverse();

  } catch (err) {
    console.error('[session-service] getLastKTurns failed:', err);
    return [];
  }
}

// Fire-and-forget — does NOT block the generation response.
// For generate-stream: call appendTurn(user) with prompt BEFORE AI call,
//                      call appendTurn(assistant) in onComplete with synopsis+files.
// For modify-stream: same pattern.
export function appendTurn(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  opts: AppendTurnOptions = {}
): void {
  if (!sessionId) return;
  const supabase = getServiceClient();

  supabase
    .from('session_messages')
    .insert({
      session_id: sessionId,
      role,
      content,
      files_affected: opts.filesAffected ? JSON.stringify(opts.filesAffected) : null,
      repair_triggered: opts.repairTriggered ?? false,
      repair_explanation: opts.repairExplanation ?? null,
    })
    .then(({ error }) => {
      if (error) console.error('[session-service] appendTurn failed:', error);
    });

  // Increment turn_count (fire-and-forget)
  supabase
    .from('project_sessions')
    .update({ turn_count: supabase.sql`turn_count + 1`, last_active_at: new Date().toISOString() })
    .eq('id', sessionId)
    .then();
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function createSession(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  projectId: string,
  memberId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('project_sessions')
    .insert({ workspace_id: workspaceId, project_id: projectId, member_id: memberId })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}
```

---

## Modified: `backend/app/api/modify-stream/route.ts`

**Bug fix (prerequisite):** Switch from `resolveWorkspaceProvider()` to `resolveWorkspaceRequestContext()`.

Current broken code (~line 40-50):
```typescript
// BROKEN: drops memberId and beginnerMode
const resolved = await resolveWorkspaceProvider(authResult.userId, body.workspaceId);
const workspaceProvider = resolved.provider;
```

Fix:
```typescript
// FIXED: reads all three fields
const workspaceCtx = await resolveWorkspaceRequestContext(request, body.workspaceId);
if (workspaceCtx.forbidden) {
  return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
}
const workspaceProvider = workspaceCtx.workspaceProvider;
const memberId = workspaceCtx.memberId;
const beginnerMode = workspaceCtx.beginnerMode ?? false;
```

---

## Session Wiring in Route Handlers

**Pattern (same for both generate-stream and modify-stream):**

```typescript
// 1. Get/create session (blocking — must complete before AI call)
const sessionId = workspaceCtx.memberId
  ? await getOrCreateSession(body.workspaceId, body.projectId, workspaceCtx.memberId)
  : null;

// 2. Fetch history prefix (blocking — must complete before AI call)
//    IMPORTANT: do this BEFORE appendTurn(user) to avoid duplicate prompt in context
const conversationHistoryPrefix = sessionId
  ? await getLastKTurns(sessionId)
  : [];

// 3. Append user turn (fire-and-forget — does not block)
if (sessionId) {
  appendTurn(sessionId, 'user', body.prompt);
}

// 4. Run unified pipeline with history prefix
const result = await pipeline.run(context, {
  ...options,
  conversationHistoryPrefix,
});

// 5. In onComplete / after result.success — append assistant turn (fire-and-forget)
if (sessionId && result.success) {
  const synopsis = buildAssistantSynopsis(result); // see below
  const changedFiles = getChangedFiles(result);    // see below
  appendTurn(sessionId, 'assistant', synopsis, {
    filesAffected: changedFiles,
  });
}
```

**`buildAssistantSynopsis(result)`** — brief description of what was built/changed:
- For generation: extract the first meaningful comment or description from the generated files, or synthesize "Generated a [type] app with [key feature]."
- For modification: use the modification result's `planSummary` or description of what changed.
- Format: `"[one-sentence description]. Files: [file1.jsx, file2.css]"`
- Cap at 200 chars to keep context tokens low.

**`getChangedFiles(result)`** — actually-changed files only:
- For generate-stream: `Object.keys(result.projectState.files)` (all files created — correct)
- For modify-stream: extract from the diff/modification result — the files that were actually modified, not the full project state.

---

## Modified: `backend/lib/core/unified-pipeline.ts`

Add typed field to `UnifiedPipelineOptions` (around line 23):

```typescript
export interface UnifiedPipelineOptions {
  requestId?: string;
  skipIntent?: boolean;
  skipPlanning?: boolean;
  /** Conversation history to prepend as context before the active user prompt. */
  conversationHistoryPrefix?: { role: 'user' | 'assistant'; content: string }[];
  /** Any additional options forwarded to the strategy. */
  [key: string]: unknown;
}
```

Thread `conversationHistoryPrefix` through `ModificationStrategy.buildPrompt()` only (not generation — generation is stateless by design). The modification strategy already has `conversationHistory` wiring via `ModifyProjectOptions` — extend that path.

---

## New: Admin Read API

### `GET /api/admin/workspaces/:wid/sessions`

```typescript
// List sessions for a workspace (paginated, cursor-based)
// Auth: requireAuth() + workspace membership check
// Response: { sessions: SessionSummary[], nextCursor?: string }

interface SessionSummary {
  id: string;
  member_id: string;
  member_name: string;       // join with workspace_members
  project_id: string;
  project_name: string;      // join with workspace_projects
  turn_count: number;
  last_active_at: string;    // ISO 8601
  created_at: string;
}

// Pagination: cursor = base64(JSON({ created_at, id }))
// Query: WHERE workspace_id = :wid AND (created_at, id) < (:cursor_created_at, :cursor_id)
// Order: created_at DESC, id DESC
// Limit: 25
```

### `GET /api/admin/sessions/:sessionId`

```typescript
// Full transcript for one session
// Auth: requireAuth() + verify session belongs to admin's workspace
// Response: { session: SessionSummary, messages: SessionMessageExport[] }

interface SessionMessageExport {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  files_affected: string[] | null;
  repair_triggered: boolean;
  repair_explanation: string | null;
  created_at: string;  // ISO 8601
}
```

### `GET /api/admin/sessions/:sessionId/export`

```typescript
// Download full transcript as JSON file
// Auth: requireAuth() + verify session belongs to admin's workspace
// Response: Content-Disposition: attachment; filename="session-{id}.json"
//           Content-Type: application/json
//           Body: SessionMessageExport[] (array, not wrapped)
```

---

## Config: `backend/lib/config.ts`

Add env var with Zod validation:

```typescript
SESSION_CONTEXT_K: z.coerce.number().int().min(1).max(50).default(10)
  .describe('Max turns to inject as conversation history prefix per AI call'),
SESSION_CONTEXT_MAX_TOKENS: z.coerce.number().int().min(1000).max(20000).default(6000)
  .describe('Max tokens for conversation history prefix (rough estimate: chars/4)'),
```

Use `SESSION_CONTEXT_MAX_TOKENS` in `getLastKTurns()` instead of the hardcoded constant.

---

## Tests to Write

### `backend/lib/__tests__/session-service.test.ts`

```
1.  getOrCreateSession() — creates new session when none exists
2.  getOrCreateSession() — returns existing active session
3.  getOrCreateSession() — marks stale session inactive, creates new one (4h+ idle)
4.  getOrCreateSession() — handles unique_violation race (concurrent INSERT) by fetching existing
5.  getOrCreateSession() — returns null on Supabase error (graceful degrade)
6.  getLastKTurns() — returns empty array when no turns exist
7.  getLastKTurns() — returns turns in chronological order (oldest first)
8.  getLastKTurns() — truncates by token budget (stops adding turns when budget exhausted)
9.  getLastKTurns() — returns empty array on Supabase error (graceful degrade)
10. appendTurn() — inserts user turn with correct fields
11. appendTurn() — inserts assistant turn with filesAffected and repairTriggered
12. appendTurn() — does nothing when sessionId is null
13. getLastKTurns() BEFORE appendTurn() — verify current prompt NOT in returned history
```

### `backend/app/api/__tests__/admin-sessions.test.ts`

```
1.  GET /api/admin/workspaces/:wid/sessions — returns paginated list for admin
2.  GET /api/admin/workspaces/:wid/sessions — returns 403 for non-admin member
3.  GET /api/admin/sessions/:sessionId — returns full transcript
4.  GET /api/admin/sessions/:sessionId — returns 403 for session outside admin's workspace
5.  GET /api/admin/sessions/:sessionId/export — returns JSON file download
6.  GET /api/admin/sessions/:sessionId — export contains all turns (append-only, none deleted)
```

### RLS test

```
Seed two workspaces + sessions. Verify service-role can read both.
Verify workspace A's authenticated member cannot read workspace B's sessions.
```

---

## Deployment Sequence

**Schema-first. Never deploy backend before migration.**

1. Apply Supabase migration — creates `project_sessions`, `session_messages`, indexes, RLS policies
2. Deploy backend — `session-service.ts` now has tables to write to
3. Deploy frontend — no breaking change (client history still sent as fallback for first release)
4. Validate in staging: run a 10-turn classroom session, verify `session_messages` rows appear
5. Ship to production

---

## Success Criteria

- "Add a button to my app" modifies the existing app (not a rewrite) for 90% of beginner-mode projects after the first generation.
- Session abandon rate drops from ~50% to <25% statefulness-attributable.
- Instructor loads a student's transcript within 2 clicks from AdminWorkspacePage.
- No regression in beginner-mode generation quality.

---

## Deferred to TODOS.md

- Rolling summary / row eviction (see TODOS.md — P3, M)
- Client-side history removal from ChatMessagesContext (see TODOS.md — P2, XS)
- Repair context injection into AI prefix (see TODOS.md — P2, S)
- Session export streaming for large sessions (see TODOS.md — P3, S)
- Full-text search UI + query endpoint (GIN index ships in migration — P3, M)
