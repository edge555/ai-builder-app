import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../../../lib/security', () => ({
  applyRateLimit: vi.fn(async () => ({ blocked: null, headers: {} })),
  RateLimitTier: {
    LOW_COST: 'LOW_COST',
  },
}));

vi.mock('../../../lib/security/auth', () => ({
  requireAuth: vi.fn(),
  createServiceRoleSupabaseClient: vi.fn(),
}));

import { requireAuth, createServiceRoleSupabaseClient } from '../../../lib/security/auth';
import { GET as listSessionsGET } from '../admin/workspaces/[wid]/sessions/route';
import { GET as getSessionGET } from '../admin/sessions/[sessionId]/route';
import { GET as exportSessionGET } from '../admin/sessions/[sessionId]/export/route';

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
  const from = vi.fn((table: string) => {
    let currentOp: 'select' | 'insert' | 'update' | 'order' = 'select';

    const builder: any = {
      select: vi.fn(() => {
        currentOp = 'select';
        return builder;
      }),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      match: vi.fn(() => builder),
      maybeSingle: vi.fn(() => Promise.resolve(resolver(table, 'maybeSingle'))),
      single: vi.fn(() => Promise.resolve(resolver(table, 'single'))),
      order: vi.fn(() => {
        currentOp = 'order';
        return builder;
      }),
      limit: vi.fn(() => Promise.resolve(resolver(table, 'limit'))),
      insert: vi.fn(() => {
        currentOp = 'insert';
        return builder;
      }),
      update: vi.fn(() => {
        currentOp = 'update';
        return builder;
      }),
      then: (onFulfilled: (value: SupabaseResponse) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolver(table, currentOp)).then(onFulfilled, onRejected),
    };

    return builder;
  });

  return { from };
}

describe('admin sessions API', () => {
  const request = new NextRequest('http://localhost/api/admin/test', {
    headers: { origin: 'http://localhost:8080' },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'admin-1' } as never);
  });

  it('GET /api/admin/workspaces/:wid/sessions returns paginated sessions', async () => {
    const supabase = createSupabaseMock(buildResolver({
      'workspaces.maybeSingle': [{ data: { org_id: 'org-1' }, error: null }],
      'organizations.maybeSingle': [{ data: { id: 'org-1' }, error: null }],
      'project_sessions.limit': [{
        data: [
          {
            id: 's1',
            member_id: 'm1',
            project_id: 'p1',
            turn_count: 3,
            last_active_at: '2026-04-15T10:00:00.000Z',
            created_at: '2026-04-15T10:00:00.000Z',
          },
        ],
        error: null,
      }],
      'members.select': [{ data: [{ id: 'm1', display_name: 'Alice' }], error: null }],
      'workspace_projects.select': [{ data: [{ id: 'p1', name: 'Demo' }], error: null }],
    }));

    vi.mocked(createServiceRoleSupabaseClient).mockReturnValue(supabase as never);

    const response = await listSessionsGET(request, { params: Promise.resolve({ wid: 'wid-1' }) });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]).toMatchObject({
      id: 's1',
      member_name: 'Alice',
      project_name: 'Demo',
      turn_count: 3,
    });
  });

  it('GET /api/admin/workspaces/:wid/sessions returns 403 for non-admin', async () => {
    const supabase = createSupabaseMock(buildResolver({
      'workspaces.maybeSingle': [{ data: { org_id: 'org-1' }, error: null }],
      'organizations.maybeSingle': [{ data: null, error: null }],
    }));

    vi.mocked(createServiceRoleSupabaseClient).mockReturnValue(supabase as never);

    const response = await listSessionsGET(request, { params: Promise.resolve({ wid: 'wid-1' }) });
    expect(response.status).toBe(403);
  });

  it('GET /api/admin/sessions/:sessionId returns full transcript', async () => {
    const supabase = createSupabaseMock(buildResolver({
      'project_sessions.maybeSingle': [{
        data: {
          id: 's1',
          workspace_id: 'wid-1',
          member_id: 'm1',
          project_id: 'p1',
          turn_count: 2,
          last_active_at: '2026-04-15T10:00:00.000Z',
          created_at: '2026-04-15T09:00:00.000Z',
        },
        error: null,
      }],
      'workspaces.maybeSingle': [{ data: { org_id: 'org-1' }, error: null }],
      'organizations.maybeSingle': [{ data: { id: 'org-1' }, error: null }],
      'members.maybeSingle': [{ data: { display_name: 'Alice' }, error: null }],
      'workspace_projects.maybeSingle': [{ data: { name: 'Demo' }, error: null }],
      'session_messages.order': [{
        data: [
          { id: 'msg-1', role: 'user', content: 'add navbar', files_affected: null, repair_triggered: false, repair_explanation: null, created_at: '2026-04-15T09:00:01.000Z' },
          { id: 'msg-2', role: 'assistant', content: 'Added navbar', files_affected: ['src/App.tsx'], repair_triggered: false, repair_explanation: null, created_at: '2026-04-15T09:00:02.000Z' },
        ],
        error: null,
      }],
    }));

    vi.mocked(createServiceRoleSupabaseClient).mockReturnValue(supabase as never);

    const response = await getSessionGET(request, { params: Promise.resolve({ sessionId: 's1' }) });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.session).toMatchObject({ id: 's1', member_name: 'Alice', project_name: 'Demo' });
    expect(body.messages).toHaveLength(2);
  });

  it('GET /api/admin/sessions/:sessionId returns 403 for session outside admin workspace', async () => {
    const supabase = createSupabaseMock(buildResolver({
      'project_sessions.maybeSingle': [{
        data: {
          id: 's1',
          workspace_id: 'wid-1',
          member_id: 'm1',
          project_id: 'p1',
          turn_count: 2,
          last_active_at: '2026-04-15T10:00:00.000Z',
          created_at: '2026-04-15T09:00:00.000Z',
        },
        error: null,
      }],
      'workspaces.maybeSingle': [{ data: { org_id: 'org-1' }, error: null }],
      'organizations.maybeSingle': [{ data: null, error: null }],
    }));

    vi.mocked(createServiceRoleSupabaseClient).mockReturnValue(supabase as never);

    const response = await getSessionGET(request, { params: Promise.resolve({ sessionId: 's1' }) });
    expect(response.status).toBe(403);
  });

  it('GET /api/admin/sessions/:sessionId/export returns attachment', async () => {
    const supabase = createSupabaseMock(buildResolver({
      'project_sessions.maybeSingle': [{ data: { id: 's1', workspace_id: 'wid-1' }, error: null }],
      'workspaces.maybeSingle': [{ data: { org_id: 'org-1' }, error: null }],
      'organizations.maybeSingle': [{ data: { id: 'org-1' }, error: null }],
      'session_messages.order': [{
        data: [
          { id: 'msg-1', role: 'user', content: 'hello', files_affected: null, repair_triggered: false, repair_explanation: null, created_at: '2026-04-15T09:00:00.000Z' },
        ],
        error: null,
      }],
    }));

    vi.mocked(createServiceRoleSupabaseClient).mockReturnValue(supabase as never);

    const response = await exportSessionGET(request, { params: Promise.resolve({ sessionId: 's1' }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toContain('session-s1.json');

    const body = await response.json();
    expect(body).toHaveLength(1);
  });
});

