import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appendTurn, getLastKTurns, getOrCreateSession } from '../session-service';

vi.mock('../security/auth', () => ({
  createServiceRoleSupabaseClient: vi.fn(),
}));

vi.mock('../config', () => ({
  config: {
    session: {
      contextK: 10,
      contextMaxTokens: 6000,
    },
  },
}));

import { createServiceRoleSupabaseClient } from '../security/auth';

type SupabaseResponse = { data: any; error: any };

function buildResolver(queues: Record<string, SupabaseResponse[]>): (table: string, op: string) => SupabaseResponse {
  return (table: string, op: string) => {
    const key = `${table}.${op}`;
    const queue = queues[key] ?? [{ data: null, error: null }];
    const next = queue.shift();
    return next ?? { data: null, error: null };
  };
}

function createSupabaseMock(resolver: (table: string, op: string) => SupabaseResponse) {
  const builders: Record<string, any[]> = {};

  const from = vi.fn((table: string) => {
    let currentOp: 'select' | 'insert' | 'update' = 'select';

    const builder: any = {
      select: vi.fn(() => {
        currentOp = 'select';
        return builder;
      }),
      match: vi.fn(() => builder),
      maybeSingle: vi.fn(() => Promise.resolve(resolver(table, 'maybeSingle'))),
      single: vi.fn(() => Promise.resolve(resolver(table, 'single'))),
      order: vi.fn(() => builder),
      limit: vi.fn(() => Promise.resolve(resolver(table, 'limit'))),
      eq: vi.fn(() => builder),
      update: vi.fn(() => {
        currentOp = 'update';
        return builder;
      }),
      insert: vi.fn(() => {
        currentOp = 'insert';
        return builder;
      }),
      returns: vi.fn(() => builder),
      then: (onFulfilled: (value: SupabaseResponse) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolver(table, currentOp)).then(onFulfilled, onRejected),
    };

    if (!builders[table]) builders[table] = [];
    builders[table].push(builder);
    return builder;
  });

  return { from, builders };
}

describe('session-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getOrCreateSession returns null when supabase client unavailable', async () => {
    vi.mocked(createServiceRoleSupabaseClient).mockReturnValue(null as never);

    const sessionId = await getOrCreateSession('w-1', 'p-1', 'm-1');
    expect(sessionId).toBeNull();
  });

  it('getLastKTurns returns empty array when supabase client unavailable', async () => {
    vi.mocked(createServiceRoleSupabaseClient).mockReturnValue(null as never);

    const turns = await getLastKTurns('session-1');
    expect(turns).toEqual([]);
  });

  it('getOrCreateSession creates a session when none exists', async () => {
    const supabase = createSupabaseMock(buildResolver({
      'project_sessions.maybeSingle': [{ data: null, error: null }],
      'project_sessions.single': [{ data: { id: 'session-1' }, error: null }],
    }));

    vi.mocked(createServiceRoleSupabaseClient).mockReturnValue(supabase as never);

    const sessionId = await getOrCreateSession('w-1', 'p-1', 'm-1');
    expect(sessionId).toBe('session-1');
  });

  it('getOrCreateSession returns existing active session', async () => {
    const supabase = createSupabaseMock(buildResolver({
      'project_sessions.maybeSingle': [{ data: { id: 'session-1', last_active_at: new Date().toISOString() }, error: null }],
      'project_sessions.update': [{ data: null, error: null }],
    }));

    vi.mocked(createServiceRoleSupabaseClient).mockReturnValue(supabase as never);

    const sessionId = await getOrCreateSession('w-1', 'p-1', 'm-1');
    expect(sessionId).toBe('session-1');
  });

  it('getOrCreateSession rotates stale session after idle timeout', async () => {
    const stale = new Date(Date.now() - (5 * 60 * 60 * 1000)).toISOString();
    const supabase = createSupabaseMock(buildResolver({
      'project_sessions.maybeSingle': [{ data: { id: 'old-session', last_active_at: stale }, error: null }],
      'project_sessions.update': [{ data: null, error: null }],
      'project_sessions.single': [{ data: { id: 'new-session' }, error: null }],
    }));

    vi.mocked(createServiceRoleSupabaseClient).mockReturnValue(supabase as never);

    const sessionId = await getOrCreateSession('w-1', 'p-1', 'm-1');
    expect(sessionId).toBe('new-session');
  });

  it('getOrCreateSession handles unique_violation race by refetching', async () => {
    const supabase = createSupabaseMock(buildResolver({
      'project_sessions.maybeSingle': [
        { data: null, error: null },
        { data: { id: 'session-from-race' }, error: null },
      ],
      'project_sessions.single': [{ data: null, error: { code: '23505', message: 'duplicate key' } }],
    }));

    vi.mocked(createServiceRoleSupabaseClient).mockReturnValue(supabase as never);

    const sessionId = await getOrCreateSession('w-1', 'p-1', 'm-1');
    expect(sessionId).toBe('session-from-race');
  });

  it('getLastKTurns returns turns in chronological order and respects token budget', async () => {
    const supabase = createSupabaseMock(buildResolver({
      'session_messages.limit': [{
        data: [
          { role: 'assistant', content: 'latest response', created_at: '2026-04-15T10:00:03Z' },
          { role: 'user', content: 'follow up', created_at: '2026-04-15T10:00:02Z' },
          { role: 'assistant', content: 'first response', created_at: '2026-04-15T10:00:01Z' },
          { role: 'user', content: 'first question', created_at: '2026-04-15T10:00:00Z' },
        ],
        error: null,
      }],
    }));

    vi.mocked(createServiceRoleSupabaseClient).mockReturnValue(supabase as never);

    const turns = await getLastKTurns('session-1', 8, 50);

    // Budget is 8 tokens. "follow up" (3) + "latest response" (4) = 7 tokens fit.
    // Should return the two MOST RECENT turns, not the two oldest.
    expect(turns).toEqual([
      { role: 'user', content: 'follow up' },
      { role: 'assistant', content: 'latest response' },
    ]);
  });

  it('getLastKTurns returns empty array on query error', async () => {
    const supabase = createSupabaseMock(buildResolver({
      'session_messages.limit': [{ data: null, error: { message: 'boom' } }],
    }));

    vi.mocked(createServiceRoleSupabaseClient).mockReturnValue(supabase as never);

    const turns = await getLastKTurns('session-1');
    expect(turns).toEqual([]);
  });

  it('appendTurn is a no-op when sessionId is null', async () => {
    const fromSpy = vi.fn();
    vi.mocked(createServiceRoleSupabaseClient).mockReturnValue({ from: fromSpy } as never);

    appendTurn(null, 'user', 'hello');

    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('appendTurn inserts assistant turn with metadata', async () => {
    const supabase = createSupabaseMock(buildResolver({
      'session_messages.insert': [{ data: null, error: null }],
      'project_sessions.maybeSingle': [{ data: { turn_count: 4 }, error: null }],
      'project_sessions.update': [{ data: null, error: null }],
    }));

    vi.mocked(createServiceRoleSupabaseClient).mockReturnValue(supabase as never);

    appendTurn('session-1', 'assistant', 'updated header', {
      filesAffected: ['src/App.tsx'],
      repairTriggered: true,
      repairExplanation: 'Fixed missing import',
    });

    await Promise.resolve();
    await Promise.resolve();

    const sessionMessagesBuilder = supabase.builders['session_messages'][0];
    expect(sessionMessagesBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({
      session_id: 'session-1',
      role: 'assistant',
      content: 'updated header',
      files_affected: ['src/App.tsx'],
      repair_triggered: true,
      repair_explanation: 'Fixed missing import',
    }));
  });
});

