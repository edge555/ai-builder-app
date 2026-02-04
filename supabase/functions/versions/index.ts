import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type VersionsBody = { projectId?: string };

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
    const body = (await req.json().catch(() => ({}))) as VersionsBody;
    const projectId = (body.projectId ?? '').trim();
    if (!projectId) {
      return new Response(JSON.stringify({ success: false, error: 'projectId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('versions')
      .select('id, project_id, created_at, message, project_state, diffs')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const versions = (data ?? []).map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      prompt: row.message,
      timestamp: new Date(row.created_at).toISOString(),
      files: row.project_state?.files ?? {},
      diffs: row.diffs ?? [],
      parentVersionId: null,
    }));

    return new Response(JSON.stringify({ versions }), {
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
