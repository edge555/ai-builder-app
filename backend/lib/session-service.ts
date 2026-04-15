import { config } from './config';
import { createLogger } from './logger';
import { createServiceRoleSupabaseClient } from './security/auth';

const logger = createLogger('session-service');

const IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
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

export async function getOrCreateSession(
  workspaceId: string,
  projectId: string,
  memberId: string
): Promise<string | null> {
  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) return null;

  try {
    const { data: existing, error } = await supabase
      .from('project_sessions')
      .select('id, last_active_at')
      .match({
        workspace_id: workspaceId,
        project_id: projectId,
        member_id: memberId,
        is_active: true,
      })
      .maybeSingle<{ id: string; last_active_at: string }>();

    if (error) throw error;

    if (existing) {
      const idleMs = Date.now() - new Date(existing.last_active_at).getTime();
      if (idleMs > IDLE_TIMEOUT_MS) {
        await supabase
          .from('project_sessions')
          .update({ is_active: false })
          .eq('id', existing.id);

        return await createSession(supabase, workspaceId, projectId, memberId);
      }

      await supabase
        .from('project_sessions')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', existing.id);

      return existing.id;
    }

    return await createSession(supabase, workspaceId, projectId, memberId);
  } catch (error) {
    if (isUniqueViolation(error)) {
      const { data } = await supabase
        .from('project_sessions')
        .select('id')
        .match({
          workspace_id: workspaceId,
          project_id: projectId,
          member_id: memberId,
          is_active: true,
        })
        .maybeSingle<{ id: string }>();
      return data?.id ?? null;
    }

    logger.error('getOrCreateSession failed', {
      error: error instanceof Error ? error.message : String(error),
      workspaceId,
      projectId,
      memberId,
    });
    return null;
  }
}

export async function getLastKTurns(
  sessionId: string,
  maxTokens: number = config.session.contextMaxTokens,
  maxTurns: number = config.session.contextK
): Promise<SessionTurn[]> {
  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) return [];

  try {
    const { data: rows, error } = await supabase
      .from('session_messages')
      .select('role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(maxTurns);

    if (error) throw error;
    if (!rows || rows.length === 0) return [];

    let tokenBudget = maxTokens;
    const selected: SessionTurn[] = [];

    // rows is ordered newest-first (DESC). Iterate newest-first so that when the
    // budget runs out we drop the oldest turns, not the most recent ones.
    for (const row of rows) {
      const tokenEstimate = Math.ceil(row.content.length / CHARS_PER_TOKEN);
      if (tokenBudget - tokenEstimate < 0) break;
      tokenBudget -= tokenEstimate;
      selected.push({ role: row.role, content: row.content });
    }

    // Reverse to restore chronological order for the AI prompt.
    return selected.reverse();
  } catch (error) {
    logger.error('getLastKTurns failed', {
      error: error instanceof Error ? error.message : String(error),
      sessionId,
    });
    return [];
  }
}

export function appendTurn(
  sessionId: string | null | undefined,
  role: 'user' | 'assistant',
  content: string,
  opts: AppendTurnOptions = {}
): void {
  if (!sessionId) return;

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) return;

  supabase
    .from('session_messages')
    .insert({
      session_id: sessionId,
      role,
      content,
      files_affected: opts.filesAffected ?? null,
      repair_triggered: opts.repairTriggered ?? false,
      repair_explanation: opts.repairExplanation ?? null,
    })
    .then(({ error }) => {
      if (error) {
        logger.error('appendTurn insert failed', {
          error: error.message,
          sessionId,
          role,
        });
      }
    });

  supabase
    .from('project_sessions')
    .select('turn_count')
    .eq('id', sessionId)
    .maybeSingle<{ turn_count: number | null }>()
    .then(({ data, error }) => {
      if (error || !data) return;
      const nextTurnCount = Math.max(0, data.turn_count ?? 0) + 1;
      return supabase
        .from('project_sessions')
        .update({
          turn_count: nextTurnCount,
          last_active_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
    })
    .then(() => {});
}

async function createSession(
  supabase: NonNullable<ReturnType<typeof createServiceRoleSupabaseClient>>,
  workspaceId: string,
  projectId: string,
  memberId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('project_sessions')
    .insert({
      workspace_id: workspaceId,
      project_id: projectId,
      member_id: memberId,
    })
    .select('id')
    .single<{ id: string }>();

  if (error) throw error;
  return data.id;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}
