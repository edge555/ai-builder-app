/**
 * Generate Stream Edge Function
 * Generates React projects with streaming file emission via SSE.
 * Calls Gemini API directly - no proxy layer.
 */
import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';
import { sanitizeError } from '../_shared/error-utils.ts';
import { createGeminiClient, getGenerationPrompt, PROJECT_OUTPUT_SCHEMA } from '../_shared/ai/index.ts';

type GenerateBody = { description?: string };

interface GeneratedFile {
  path: string;
  content: string;
}

interface ProjectOutput {
  files: GeneratedFile[];
}

const HEARTBEAT_INTERVAL_MS = 10000; // 10 seconds
const STREAM_TIMEOUT_MS = 120000; // 120 seconds

/**
 * SSE Encoder for streaming responses.
 */
class SSEEncoder {
  private encoder = new TextEncoder();

  encode(event: string, data: unknown): Uint8Array {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    return this.encoder.encode(message);
  }

  heartbeat(): Uint8Array {
    return this.encoder.encode(': heartbeat\n\n');
  }
}

/**
 * Validates and sanitizes file paths.
 */
function sanitizePath(path: string): string {
  // Remove leading/trailing whitespace
  let sanitized = path.trim();

  // Normalize path separators
  sanitized = sanitized.replace(/\\/g, '/');

  // Remove any leading slashes
  sanitized = sanitized.replace(/^\/+/, '');

  return sanitized;
}

/**
 * Adds frontend/ prefix to paths that need it.
 */
function prefixPath(path: string): string {
  const sanitized = sanitizePath(path);

  // If already prefixed with frontend/, return as-is
  if (sanitized.startsWith('frontend/')) {
    return sanitized;
  }

  // Add frontend/ prefix
  return `frontend/${sanitized}`;
}

/**
 * Extracts a project name from the description.
 */
function extractProjectName(description: string): string {
  const words = description
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0)
    .slice(0, 3);

  if (words.length === 0) {
    return 'new-project';
  }

  return words.join('-').toLowerCase();
}

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

    console.log('[generate-stream] Starting project generation for:', description.substring(0, 100));

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new SSEEncoder();
        let heartbeatInterval: number | null = null;
        let streamTimeout: number | null = null;
        let isComplete = false;

        const cleanup = () => {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          if (streamTimeout) clearTimeout(streamTimeout);
          isComplete = true;
        };

        try {
          // Set up heartbeat
          heartbeatInterval = setInterval(() => {
            if (!isComplete) {
              controller.enqueue(encoder.heartbeat());
            }
          }, HEARTBEAT_INTERVAL_MS);

          // Set up timeout
          streamTimeout = setTimeout(() => {
            if (!isComplete) {
              cleanup();
              controller.enqueue(encoder.encode('error', {
                error: 'Stream timeout after 120 seconds',
              }));
              controller.close();
            }
          }, STREAM_TIMEOUT_MS);

          // Send start event
          controller.enqueue(encoder.encode('start', { timestamp: Date.now() }));

          // Build prompt
          const systemInstruction = getGenerationPrompt(description);

          // Create Gemini client and make streaming request
          const gemini = createGeminiClient();

          const response = await gemini.generateStreaming({
            prompt: 'Generate the project based on the user request in the system instruction.',
            systemInstruction,
            temperature: 0.7,
            responseSchema: PROJECT_OUTPUT_SCHEMA,
            onChunk: (_chunk: string, accumulatedLength: number) => {
              // Send progress events
              controller.enqueue(encoder.encode('progress', { length: accumulatedLength }));
            },
          });

          if (!response.success || !response.content) {
            const error = response.error ?? 'Failed to generate project from AI';
            controller.enqueue(encoder.encode('error', { error }));
            cleanup();
            controller.close();
            return;
          }

          // Parse the response
          let parsedOutput: ProjectOutput;
          try {
            parsedOutput = JSON.parse(response.content) as ProjectOutput;
          } catch (e) {
            const error = `Failed to parse AI response: ${e instanceof Error ? e.message : 'Invalid JSON'}`;
            controller.enqueue(encoder.encode('error', { error }));
            cleanup();
            controller.close();
            return;
          }

          // Validate basic structure
          if (!parsedOutput.files || !Array.isArray(parsedOutput.files)) {
            controller.enqueue(encoder.encode('error', { error: 'Invalid AI response: missing files array' }));
            cleanup();
            controller.close();
            return;
          }

          // Process files: add frontend/ prefix, normalize paths
          const processedFiles: Record<string, string> = {};
          for (const file of parsedOutput.files) {
            if (file.path && file.content) {
              const prefixedPath = prefixPath(file.path);
              processedFiles[prefixedPath] = file.content;
            }
          }

          // Emit files one by one
          const fileEntries = Object.entries(processedFiles);
          for (let i = 0; i < fileEntries.length; i++) {
            const [path, content] = fileEntries[i];
            controller.enqueue(encoder.encode('file', {
              path,
              content,
              index: i,
              total: fileEntries.length,
            }));
          }

          // Create project state and version
          const now = new Date().toISOString();
          const projectId = crypto.randomUUID();
          const versionId = crypto.randomUUID();

          const projectState = {
            id: projectId,
            name: extractProjectName(description),
            description: description,
            files: processedFiles,
            createdAt: now,
            updatedAt: now,
            currentVersionId: versionId,
          };

          const version = {
            id: versionId,
            projectId: projectId,
            prompt: description,
            timestamp: now,
            files: processedFiles,
            diffs: [],
            parentVersionId: null,
          };

          // Send complete event
          controller.enqueue(encoder.encode('complete', {
            success: true,
            projectState,
            version,
          }));

          // Save to database
          try {
            const supabase = createServiceClient();

            const { data: project, error: projectErr } = await supabase
              .from('projects')
              .insert({
                name: projectState.name,
                description: projectState.description
              })
              .select('id')
              .single();

            if (!projectErr && project) {
              const dbProjectId = project.id as string;

              await supabase.from('versions').insert({
                id: versionId,
                project_id: dbProjectId,
                message: description,
                project_state: projectState,
                diffs: [],
                change_summary: null,
              });

              console.log('[generate-stream] Saved project to database:', dbProjectId);
            }
          } catch (dbError) {
            console.error('[generate-stream] Database save error:', dbError);
            // Don't fail the stream if DB save fails
          }

          cleanup();
          controller.close();

          console.log('[generate-stream] Generation completed successfully');

        } catch (e) {
          cleanup();

          const errorMessage = e instanceof Error ? sanitizeError(e.message) : 'Unknown error';
          console.error('[generate-stream] Error:', errorMessage);

          controller.enqueue(encoder.encode('error', { error: errorMessage }));
          controller.close();
        }
      },
    });

    // Return SSE response
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
    console.error('[generate-stream] Fatal error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
