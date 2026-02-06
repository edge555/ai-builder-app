/**
 * Versions Edge Function (Thin Proxy)
 * Forwards version list requests to the Next.js backend API
 * Phase 1: Consolidation - this is now a thin proxy, all business logic is in packages/backend/lib
 */
import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { sanitizeError } from '../_shared/error-utils.ts';

type VersionsBody = { projectId?: string };

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }

  try {
    // Parse request body
    const body = (await req.json().catch(() => ({}))) as VersionsBody;
    const projectId = (body.projectId ?? '').trim();
    
    if (!projectId) {
      return new Response(
        JSON.stringify({ success: false, error: 'projectId is required' }), 
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get Next.js backend URL from environment
    const backendUrl = Deno.env.get('NEXTJS_BACKEND_URL') || 'http://localhost:3000';
    const apiUrl = `${backendUrl}/api/versions?projectId=${encodeURIComponent(projectId)}`;

    // Forward request to Next.js backend (GET request)
    const backendResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      throw new Error(`Backend error ${backendResponse.status}: ${errorText}`);
    }

    // Get the response from backend and forward it
    const result = await backendResponse.json();

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
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
