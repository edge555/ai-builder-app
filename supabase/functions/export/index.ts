/**
 * Export Edge Function (Thin Proxy)
 * Forwards export requests to the Next.js backend API
 * Phase 1: Consolidation - this is now a thin proxy, all business logic is in packages/backend/lib
 */
import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { sanitizeError } from '../_shared/error-utils.ts';

type ExportBody = {
  projectState?: {
    name?: string;
    files?: Record<string, string>;
  };
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }

  try {
    // Parse and validate request body
    const body = (await req.json().catch(() => ({}))) as ExportBody;
    const files = body.projectState?.files;
    
    if (!files || typeof files !== 'object') {
      return new Response(
        JSON.stringify({ success: false, error: 'projectState.files is required' }), 
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get Next.js backend URL from environment
    const backendUrl = Deno.env.get('NEXTJS_BACKEND_URL') || 'http://localhost:3000';
    const apiUrl = `${backendUrl}/api/export`;

    // Forward request to Next.js backend
    const backendResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      throw new Error(`Backend error ${backendResponse.status}: ${errorText}`);
    }

    // For export, we need to forward the binary response
    const contentType = backendResponse.headers.get('Content-Type');
    const contentDisposition = backendResponse.headers.get('Content-Disposition');
    const zipBuffer = await backendResponse.arrayBuffer();

    return new Response(zipBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType || 'application/zip',
        'Content-Disposition': contentDisposition || 'attachment; filename="project.zip"',
      },
    });

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
