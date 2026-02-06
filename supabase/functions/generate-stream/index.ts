import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function sanitizeError(message: string): string {
  return message
    .replace(/key=[^&\s"']+/gi, 'key=REDACTED')
    .replace(/apikey=[^&\s"']+/gi, 'apikey=REDACTED')
    .replace(/token=[^&\s"']+/gi, 'token=REDACTED')
    .replace(/secret=[^&\s"']+/gi, 'secret=REDACTED')
    .replace(/password=[^&\s"']+/gi, 'password=REDACTED')
    .replace(/SUPABASE_SERVICE_ROLE_KEY[^&\s"']*/gi, 'SUPABASE_SERVICE_ROLE_KEY=REDACTED')
    .replace(/GEMINI_API_KEY[^&\s"']*/gi, 'GEMINI_API_KEY=REDACTED');
}

type SerializedProjectState = {
  id: string;
  name: string;
  description: string;
  files: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  currentVersionId: string;
};

type SerializedVersion = {
  id: string;
  projectId: string;
  prompt: string;
  timestamp: string;
  files: Record<string, string>;
  diffs: any[];
  parentVersionId: string | null;
};

type GenerateBody = { description?: string; stream?: boolean };

type GeminiGenerateShape = {
  name: string;
  description: string;
  files: Record<string, string>;
};

function createServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url) throw new Error('SUPABASE_URL is not configured');
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

function extractJsonObject(text: string): unknown {
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    throw new Error('Model response did not contain JSON');
  }
  return JSON.parse(text.slice(first, last + 1));
}

function buildPreviewCompatiblePrompt(userDescription: string): string {
  return (
    'You generate a complete Vite + React + TypeScript project as a JSON object.\n' +
    'Return ONLY valid JSON (no markdown).\n\n' +
    'Schema:\n{ "name": string, "description": string, "files": { "path": "file contents" } }\n\n' +
    'CRITICAL preview constraints:\n' +
    '- Styling MUST be plain CSS only (no Tailwind, no PostCSS, no CSS-in-JS libraries).\n' +
    '- MUST include src/index.css with real base styles (tokens + layout + typography + buttons + inputs + card).\n' +
    '- MUST import "./index.css" from src/main.tsx.\n' +
    '- Avoid external dependencies beyond react and react-dom (do not add libraries).\n\n' +
    'Required minimum files:\n' +
    '- index.html\n' +
    '- src/main.tsx\n' +
    '- src/index.css\n' +
    '- src/App.tsx\n\n' +
    'UI baseline (keep it clean and consistent):\n' +
    '- Full-height app (min-height: 100vh)\n' +
    '- Centered container with responsive padding\n' +
    '- Visible primary button + input styles\n' +
    '- At least one card/surface section\n\n' +
    `User request:\n${userDescription}`
  );
}

/**
 * Stream response from Gemini API using SSE format.
 */
async function* geminiStream(prompt: string, model: string): AsyncGenerator<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4 },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    const sanitized = sanitizeError(t || resp.statusText);
    throw new Error(`Gemini error ${resp.status}: ${sanitized}`);
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    
    // Parse SSE events
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data && data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (text) {
              yield text;
            }
          } catch {
            // Skip invalid JSON chunks
          }
        }
      }
    }
  }
}

function fallbackProject(description: string): GeminiGenerateShape {
  const safeDesc = description.replace(/`/g, '\\`');
  return {
    name: 'Generated App',
    description,
    files: {
      'README.md': `# Generated App\n\n${description}\n`,
      'index.html':
        '<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Generated App</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
      'src/main.tsx':
        `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport './index.css';\nimport App from './App';\n\nReactDOM.createRoot(document.getElementById('root')!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n`,
      'src/App.tsx':
        `import React from 'react';\n\nexport default function App() {\n  return (\n    <div className="app">\n      <header className="hero">\n        <div className="container">\n          <h1 className="title">${safeDesc || 'Your app is ready.'}</h1>\n          <p className="subtitle">Start building your application.</p>\n          <button className="btn btnPrimary" type="button">Get Started</button>\n        </div>\n      </header>\n    </div>\n  );\n}\n`,
      'src/index.css':
        `:root {\n  --bg: 216 33% 97%;\n  --fg: 222 28% 12%;\n  --muted: 220 12% 45%;\n  --card: 0 0% 100%;\n  --border: 220 18% 88%;\n  --primary: 250 84% 54%;\n  --primary-ink: 0 0% 100%;\n  --radius: 16px;\n  --shadow: 0 18px 50px -25px hsl(222 28% 12% / 0.25);\n  --font: ui-sans-serif, system-ui, -apple-system, sans-serif;\n}\n\n* { box-sizing: border-box; }\nhtml, body { height: 100%; margin: 0; }\nbody { font-family: var(--font); color: hsl(var(--fg)); background: hsl(var(--bg)); }\n.container { width: min(1100px, calc(100% - 40px)); margin: 0 auto; }\n.app { min-height: 100vh; display: flex; flex-direction: column; }\n.hero { padding: 64px 0 32px; }\n.title { margin: 0; font-size: clamp(34px, 4vw, 54px); }\n.subtitle { margin: 12px 0 0; color: hsl(var(--muted)); }\n.btn { display: inline-flex; padding: 12px 20px; border: none; border-radius: 12px; font-weight: 600; cursor: pointer; }\n.btnPrimary { background: hsl(var(--primary)); color: hsl(var(--primary-ink)); }\n`,
    },
  };
}

/**
 * SSE event formatter
 */
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as GenerateBody;
    const description = (body.description ?? '').trim();
    
    if (!description) {
      return new Response(JSON.stringify({ success: false, error: 'Description is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash';
    const prompt = buildPreviewCompatiblePrompt(description);

    // Create a streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let fullText = '';
        let lastSentLength = 0;
        
        try {
          // Send initial event
          controller.enqueue(encoder.encode(sseEvent('start', { phase: 'generating' })));

          // Stream from Gemini
          for await (const chunk of geminiStream(prompt, model)) {
            fullText += chunk;
            
            // Send progress updates with accumulated text
            // Only send if we have new content (throttle updates)
            if (fullText.length - lastSentLength > 50) {
              controller.enqueue(encoder.encode(sseEvent('progress', { 
                text: fullText,
                length: fullText.length 
              })));
              lastSentLength = fullText.length;
            }
          }

          // Parse the final JSON
          let generated: GeminiGenerateShape;
          try {
            generated = extractJsonObject(fullText) as GeminiGenerateShape;
            if (!generated?.files || typeof generated.files !== 'object') {
              generated = fallbackProject(description);
            }
          } catch {
            generated = fallbackProject(description);
          }

          // Send file events one by one for visual effect
          const files = generated.files || {};
          const fileEntries = Object.entries(files);
          
          for (let i = 0; i < fileEntries.length; i++) {
            const [path, content] = fileEntries[i];
            controller.enqueue(encoder.encode(sseEvent('file', { 
              path, 
              content,
              index: i,
              total: fileEntries.length
            })));
            // Small delay between files for visual effect
            await new Promise(r => setTimeout(r, 50));
          }

          // Save to database
          const supabase = createServiceClient();
          
          const { data: project, error: projectErr } = await supabase
            .from('projects')
            .insert({ name: generated.name ?? '', description: generated.description ?? '' })
            .select('id')
            .single();
          
          if (projectErr) throw projectErr;

          const projectId = project.id as string;
          const versionId = crypto.randomUUID();
          const nowIso = new Date().toISOString();

          const projectState: SerializedProjectState = {
            id: projectId,
            name: generated.name ?? 'Generated App',
            description: generated.description ?? description,
            files: generated.files ?? {},
            createdAt: nowIso,
            updatedAt: nowIso,
            currentVersionId: versionId,
          };

          await supabase.from('versions').insert({
            id: versionId,
            project_id: projectId,
            message: description,
            project_state: projectState,
            diffs: [],
            change_summary: null,
          });

          const version: SerializedVersion = {
            id: versionId,
            projectId,
            prompt: description,
            timestamp: nowIso,
            files: projectState.files,
            diffs: [],
            parentVersionId: null,
          };

          // Send final complete event
          controller.enqueue(encoder.encode(sseEvent('complete', { 
            success: true, 
            projectState, 
            version 
          })));

        } catch (e) {
          const msg = e instanceof Error ? sanitizeError(e.message) : 'Unknown error';
          controller.enqueue(encoder.encode(sseEvent('error', { error: msg })));
        } finally {
          controller.close();
        }
      }
    });

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
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
