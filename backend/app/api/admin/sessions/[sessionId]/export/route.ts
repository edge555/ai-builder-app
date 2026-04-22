import { NextRequest } from 'next/server';
import { applyRateLimit, RateLimitTier } from '../../../../../../lib/security';
import { createServiceRoleSupabaseClient, requireAuth } from '../../../../../../lib/security/auth';
import { corsError, getCorsHeaders, handleOptions } from '../../../../../../lib/api';
import { normalizeFilesAffected, verifyWorkspaceAdmin } from '../../../session-utils';

// Match the transcript cap so the export byte size is bounded.
// Streaming export for very large sessions is tracked in TODOS.md (P3).
const MAX_EXPORT_MESSAGES = 5000;

interface SessionRow {
  id: string;
  workspace_id: string;
}

interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  files_affected: unknown;
  repair_triggered: boolean;
  repair_explanation: string | null;
  created_at: string;
}

export async function OPTIONS() {
  return handleOptions();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.LOW_COST);
  if (blocked) return blocked;

  const authResult = await requireAuth(request);
  if (authResult instanceof Response) return authResult;

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) return corsError(request, 'Supabase not configured', 503);

  const { data: session, error: sessionError } = await supabase
    .from('project_sessions')
    .select('id, workspace_id')
    .eq('id', sessionId)
    .maybeSingle<SessionRow>();

  if (sessionError) return corsError(request, 'Failed to fetch session', 500);
  if (!session) return corsError(request, 'Session not found', 404);

  const isAdmin = await verifyWorkspaceAdmin(supabase, session.workspace_id, authResult.userId);
  if (!isAdmin) return corsError(request, 'Forbidden', 403);

  const { data: messages, error: messagesError } = await supabase
    .from('session_messages')
    .select('id, role, content, files_affected, repair_triggered, repair_explanation, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(MAX_EXPORT_MESSAGES);

  if (messagesError) return corsError(request, 'Failed to export transcript', 500);

  const exportRows = ((messages ?? []) as MessageRow[]).map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    files_affected: normalizeFilesAffected(row.files_affected),
    repair_triggered: row.repair_triggered ?? false,
    repair_explanation: row.repair_explanation,
    created_at: row.created_at,
  }));

  const jsonl = exportRows.map((row) => JSON.stringify(row)).join('\n');

  return new Response(jsonl, {
    headers: {
      ...getCorsHeaders(request),
      ...rlHeaders,
      'Content-Type': 'application/x-ndjson',
      'Content-Disposition': `attachment; filename="session-${sessionId}.jsonl"`,
    },
  });
}

