// Regression: ISSUE-001 — getLastKTurns returned OLDEST turns when token budget was
// exceeded instead of the most recent turns. The AI was getting stale context from
// the beginning of a conversation instead of the last few exchanges.
// Found by /qa on 2026-04-15
// Report: .gstack/qa-reports/qa-report-feat-reliable-continuation-2026-04-15.md

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getLastKTurns } from '../session-service';

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

function buildLimitMock(rows: { role: string; content: string; created_at: string }[]) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  const from = vi.fn(() => builder);
  return { from };
}

describe('ISSUE-001 regression: getLastKTurns newest-first truncation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the NEWEST turns when token budget forces truncation', async () => {
    // 4 turns, budget only fits 2. Should get turns 3 and 4 (newest), not 1 and 2.
    // DB returns newest-first. Each content here is ~4 tokens (16 chars / 4).
    const rows = [
      { role: 'assistant', content: 'fourth message!!', created_at: '2026-04-15T10:00:04Z' },
      { role: 'user',      content: 'third message!!!', created_at: '2026-04-15T10:00:03Z' },
      { role: 'assistant', content: 'second message!!', created_at: '2026-04-15T10:00:02Z' },
      { role: 'user',      content: 'first message!!!', created_at: '2026-04-15T10:00:01Z' },
    ];
    vi.mocked(createServiceRoleSupabaseClient).mockReturnValue(buildLimitMock(rows) as never);

    // Budget for 2 turns (each is 16 chars = 4 tokens → total 8 tokens)
    const turns = await getLastKTurns('s1', 8, 4);

    // Must be the most recent 2 turns in chronological order
    expect(turns).toEqual([
      { role: 'user', content: 'third message!!!' },
      { role: 'assistant', content: 'fourth message!!' },
    ]);
  });

  it('returns all turns in chronological order when budget is sufficient', async () => {
    const rows = [
      { role: 'assistant', content: 'reply', created_at: '2026-04-15T10:00:02Z' },
      { role: 'user',      content: 'hello', created_at: '2026-04-15T10:00:01Z' },
    ];
    vi.mocked(createServiceRoleSupabaseClient).mockReturnValue(buildLimitMock(rows) as never);

    const turns = await getLastKTurns('s1', 10000, 10);

    expect(turns).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'reply' },
    ]);
  });

  it('returns empty array when the very first turn exceeds the budget', async () => {
    const rows = [
      { role: 'user', content: 'a'.repeat(400), created_at: '2026-04-15T10:00:01Z' },
    ];
    vi.mocked(createServiceRoleSupabaseClient).mockReturnValue(buildLimitMock(rows) as never);

    // Budget = 10 tokens, message = 400 chars = 100 tokens
    const turns = await getLastKTurns('s1', 10, 10);

    expect(turns).toEqual([]);
  });
});
