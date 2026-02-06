/**
 * Modify Edge Function (Thin Proxy)
 * Forwards modification requests to the Next.js backend API
 * Phase 1: Consolidation - this is now a thin proxy, all business logic is in packages/backend/lib
 */
import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';
import { sanitizeError } from '../_shared/error-utils.ts';

type SerializedProjectState = {
  id: string;
  name: string;
  description: string;
  files: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  currentVersionId: string;
};

type RuntimeErrorInfo = {
  message: string;
  stack?: string;
  componentStack?: string;
  filePath?: string;
  line?: number;
  type: string;
  timestamp: string;
};

type ModifyBody = { 
  projectState?: SerializedProjectState; 
  prompt?: string;
  runtimeError?: RuntimeErrorInfo;
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }

  try {
    // Parse and validate request body
    const body = (await req.json().catch(() => ({}))) as ModifyBody;
    const promptText = (body.prompt ?? '').trim();
    const current = body.projectState;
    const runtimeError = body.runtimeError;

    if (!current?.id) {
      return new Response(
        JSON.stringify({ success: false, error: 'projectState is required' }), 
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    if (!promptText) {
      return new Response(
        JSON.stringify({ success: false, error: 'prompt is required' }), 
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get Next.js backend URL from environment
    const backendUrl = Deno.env.get('NEXTJS_BACKEND_URL') || 'http://localhost:3000';
    const apiUrl = `${backendUrl}/api/modify`;

    // Forward request to Next.js backend
    const backendResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        projectState: current,
        prompt: promptText,
        runtimeError,
      }),
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      throw new Error(`Backend error ${backendResponse.status}: ${errorText}`);
    }

    // Get the response from backend
    const result = await backendResponse.json();

    // Save to Supabase database
    if (result.success && result.projectState && result.version) {
      const supabase = createServiceClient();
      const nextState = result.projectState;

      // Update project metadata
      await supabase
        .from('projects')
        .update({ name: nextState.name, description: nextState.description })
        .eq('id', current.id);

      // Save new version
      const { error: verErr } = await supabase.from('versions').insert({
        id: result.version.id,
        project_id: current.id,
        message: promptText,
        project_state: nextState,
        diffs: result.diffs || [],
        change_summary: result.changeSummary || null,
      });
      
      if (verErr) throw verErr;
    }

    // Return the result
    return new Response(
      JSON.stringify(result),
      {
        status: result.success ? 200 : 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (e) {
    const msg = e instanceof Error ? sanitizeError(e.message) : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
