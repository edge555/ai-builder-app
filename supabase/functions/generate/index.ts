/**
 * Generate Edge Function (Thin Proxy)
 * Forwards generation requests to the Next.js backend API
 * Phase 1: Consolidation - this is now a thin proxy, all business logic is in packages/backend/lib
 */
import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';
import { sanitizeError } from '../_shared/error-utils.ts';

type GenerateBody = { description?: string };

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }

  try {
    // Parse and validate request body
    const body = (await req.json().catch(() => ({}))) as GenerateBody;
    const description = (body.description ?? '').trim();
    
    if (!description) {
      return new Response(
        JSON.stringify({ success: false, error: 'Description is required' }), 
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get Next.js backend URL from environment
    const backendUrl = Deno.env.get('NEXTJS_BACKEND_URL') || 'http://localhost:3000';
    const apiUrl = `${backendUrl}/api/generate`;

    // Forward request to Next.js backend
    const backendResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ description }),
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
      
      const { data: project, error: projectErr } = await supabase
        .from('projects')
        .insert({ 
          name: result.projectState.name, 
          description: result.projectState.description 
        })
        .select('id')
        .single();
      
      if (projectErr) throw projectErr;

      const projectId = project.id as string;
      
      // Update the project state with the database ID
      result.projectState.id = projectId;
      result.version.projectId = projectId;

      // Save version to database
      const { error: verErr } = await supabase.from('versions').insert({
        id: result.version.id,
        project_id: projectId,
        message: description,
        project_state: result.projectState,
        diffs: [],
        change_summary: null,
      });
      
      if (verErr) throw verErr;
    }

    // Return the result
    return new Response(
      JSON.stringify(result),
      {
        status: result.success ? 201 : 422,
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
