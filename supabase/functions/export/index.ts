import JSZip from 'npm:jszip@3.10.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type ExportBody = {
  projectState?: {
    name?: string;
    files?: Record<string, string>;
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as ExportBody;
    const files = body.projectState?.files;
    if (!files || typeof files !== 'object') {
      return new Response(JSON.stringify({ success: false, error: 'projectState.files is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const zip = new JSZip();
    for (const [path, content] of Object.entries(files)) {
      zip.file(path, content ?? '');
    }
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const zipBody = bytes as unknown as BodyInit;

    const rawName = body.projectState?.name?.trim() || 'project';
    const safe = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
    const filename = `${safe}.zip`;

    return new Response(zipBody, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
