/**
 * Generate Stream Edge Function (Thin Proxy)
 * Forwards streaming generation requests to the Next.js backend API
 * Phase 6: True Incremental Streaming - streams SSE events from backend
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
    const apiUrl = `${backendUrl}/api/generate-stream`;

    // Forward streaming request to Next.js backend
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

    // Stream the response back to the client
    // We'll also capture the complete event to save to database
    const reader = backendResponse.body?.getReader();
    if (!reader) {
      throw new Error('No response body from backend');
    }

    const stream = new ReadableStream({
      async start(controller) {
        const decoder = new TextDecoder();
        let buffer = '';
        let completeData: any = null;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Forward the chunk to the client
            controller.enqueue(value);

            // Also parse to capture the complete event for database saving
            buffer += decoder.decode(value, { stream: true });
            
            // Try to extract complete event
            const completeMatch = buffer.match(/event: complete\ndata: ({[^}]+})\n\n/);
            if (completeMatch) {
              try {
                completeData = JSON.parse(completeMatch[1]);
              } catch {
                // Ignore parse errors
              }
            }
          }

          // Save to database if we got a complete event
          if (completeData?.success && completeData.projectState && completeData.version) {
            const supabase = createServiceClient();
            
            const { data: project, error: projectErr } = await supabase
              .from('projects')
              .insert({ 
                name: completeData.projectState.name, 
                description: completeData.projectState.description 
              })
              .select('id')
              .single();
            
            if (!projectErr) {
              const projectId = project.id as string;
              
              // Save version to database
              await supabase.from('versions').insert({
                id: completeData.version.id,
                project_id: projectId,
                message: description,
                project_state: completeData.projectState,
                diffs: [],
                change_summary: null,
              });
            }
          }

          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });

    // Return streaming response
    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
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
