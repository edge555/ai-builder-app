import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type SerializedProjectState = {
  id: string;
  name: string;
  description: string;
  files: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  currentVersionId: string;
};

type RevertBody = { projectId?: string; versionId?: string };

function createServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url) throw new Error('SUPABASE_URL is not configured');
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as RevertBody;
    const projectId = (body.projectId ?? '').trim();
    const versionId = (body.versionId ?? '').trim();
    if (!projectId || !versionId) {
      return new Response(JSON.stringify({ success: false, error: 'projectId and versionId are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createServiceClient();
    const { data: target, error: targetErr } = await supabase
      .from('versions')
      .select('id, project_state')
      .eq('id', versionId)
      .eq('project_id', projectId)
      .single();
    if (targetErr) throw targetErr;

    const newVersionId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const baseState = (target as any).project_state as SerializedProjectState;
    const restored: SerializedProjectState = {
      ...baseState,
      id: projectId,
      updatedAt: nowIso,
      currentVersionId: newVersionId,
    };

    const { error: insertErr } = await supabase.from('versions').insert({
      id: newVersionId,
      project_id: projectId,
      message: `Revert to ${versionId}`,
      project_state: restored,
      diffs: [],
      change_summary: null,
    });
    if (insertErr) throw insertErr;

    const version = {
      id: newVersionId,
      projectId,
      prompt: `Revert to ${versionId}`,
      timestamp: nowIso,
      files: restored.files,
      diffs: [],
      parentVersionId: null,
    };

    return new Response(JSON.stringify({ success: true, projectState: restored, version }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
