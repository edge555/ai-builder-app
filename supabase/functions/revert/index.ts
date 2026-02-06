/**
 * Revert Edge Function (Thin Proxy)
 * Forwards revert requests to the Next.js backend API
 * Phase 1: Consolidation - this is now a thin proxy, all business logic is in packages/backend/lib
 */
import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { sanitizeError } from '../_shared/error-utils.ts';

type RevertBody = { projectId?: string; versionId?: string };

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }

  try {
    // Parse and validate request body
    const body = (await req.json().catch(() => ({}))) as RevertBody;
    const projectId = (body.projectId ?? '').trim();
    const versionId = (body.versionId ?? '').trim();
    
    if (!projectId || !versionId) {
      return new Response(
        JSON.stringify({ success: false, error: 'projectId and versionId are required' }), 
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get Next.js backend URL from environment
    const backendUrl = Deno.env.get('NEXTJS_BACKEND_URL') || 'http://localhost:3000';
    const apiUrl = `${backendUrl}/api/revert`;

    // Forward request to Next.js backend
    const backendResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ projectId, versionId }),
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
        status: result.success ? 200 : 404,
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
