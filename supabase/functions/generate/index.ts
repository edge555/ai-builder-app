import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

type GenerateBody = { description?: string };

type GeminiGenerateShape = {
  name: string;
  description: string;
  files: Record<string, string>;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

type StyleValidation = {
  issues: string[];
  warnings: string[];
  offendingFiles: string[];
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

function isNonTrivialCss(css: string | undefined): boolean {
  if (!css) return false;
  const trimmed = css.trim();
  if (trimmed.length < 300) return false;
  // Require at least a couple of baseline selectors/tokens
  const hasRoot = /:root\s*\{[\s\S]*?\}/.test(trimmed);
  const hasBody = /\bbody\b/.test(trimmed);
  return hasRoot || hasBody;
}

function mainImportsIndexCss(mainTsx: string | undefined): boolean {
  if (!mainTsx) return false;
  // allow either ./index.css or src/index.css
  return /import\s+['"]\.?\/?index\.css['"];?/m.test(mainTsx) || /import\s+['"]\/?src\/?index\.css['"];?/m.test(mainTsx);
}

function detectTailwindLikeUsage(files: Record<string, string>): { hits: Array<{ filePath: string; reason: string }> } {
  const hits: Array<{ filePath: string; reason: string }> = [];

  const strongSignals = [
    { re: /@tailwind\s+(base|components|utilities)\b/, reason: 'contains @tailwind directive' },
    { re: /from\s+['"]tailwindcss['"]/, reason: 'imports tailwindcss' },
    { re: /tailwindcss\//, reason: 'references tailwindcss/*' },
    { re: /postcss\b/, reason: 'references postcss' },
  ];

  // Heuristic: className strings that look like Tailwind utilities.
  // Keep conservative: require multiple utility tokens OR typical "min-h-screen" etc.
  const classNameAttr = /className\s*=\s*{?\s*['"]([\s\S]*?)['"]\s*}?/g;
  const twToken = /\b(?:min-h-screen|container|mx-auto|px-\d+|py-\d+|p-\d+|m-\d+|mt-\d+|mb-\d+|ml-\d+|mr-\d+|gap-\d+|space-[xy]-\d+|grid|flex|items-center|justify-center|justify-between|text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)|font-(?:thin|light|normal|medium|semibold|bold)|bg-[\w-]+|rounded(?:-[\w-]+)?|shadow(?:-[\w-]+)?|w-\d+|h-\d+|max-w-[\w-]+)\b/;

  for (const [filePath, content] of Object.entries(files)) {
    // Only scan relevant text-ish files
    if (!/\.(tsx|ts|jsx|js|css|html)$/.test(filePath)) continue;

    for (const s of strongSignals) {
      if (s.re.test(content)) {
        hits.push({ filePath, reason: s.reason });
        break;
      }
    }

    if (/\.(tsx|jsx)$/.test(filePath)) {
      classNameAttr.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = classNameAttr.exec(content))) {
        const raw = m[1] ?? '';
        const tokens = raw.split(/\s+/).filter(Boolean);
        const twMatches = tokens.filter((t) => twToken.test(t));
        if (twMatches.length >= 3 || twMatches.includes('min-h-screen') || twMatches.includes('mx-auto')) {
          hits.push({ filePath, reason: `Tailwind-like className detected (${twMatches.slice(0, 5).join(', ')})` });
          break;
        }
      }
    }
  }

  return { hits };
}

function validateStylingBaseline(files: Record<string, string>): StyleValidation {
  const issues: string[] = [];
  const warnings: string[] = [];
  const offendingFiles: string[] = [];

  const indexCss = files['src/index.css'];
  const mainTsx = files['src/main.tsx'];
  const appTsx = files['src/App.tsx'];

  if (!isNonTrivialCss(indexCss)) {
    issues.push('Missing or too-small src/index.css (must include real base styles).');
    offendingFiles.push('src/index.css');
  }

  if (!mainImportsIndexCss(mainTsx)) {
    issues.push('src/main.tsx must import ./index.css so styling is applied.');
    offendingFiles.push('src/main.tsx');
  }

  if (!appTsx) {
    issues.push('Missing src/App.tsx.');
    offendingFiles.push('src/App.tsx');
  }

  const tw = detectTailwindLikeUsage(files);
  if (tw.hits.length > 0) {
    issues.push(
      'Tailwind/PostCSS-style patterns detected. The preview runtime does not support Tailwind; use plain CSS classes instead.'
    );
    for (const hit of tw.hits) offendingFiles.push(hit.filePath);
  }

  // Soft baseline checks (do not fail generation)
  if (indexCss) {
    const hasButton = /\.(btn|button)\b|button\s*\{/.test(indexCss);
    const hasCard = /\.(card|panel|surface)\b/.test(indexCss);
    if (!hasButton) warnings.push('Consider adding a primary button style (.btn / button).');
    if (!hasCard) warnings.push('Consider adding a card/surface style (.card / .panel).');
  }

  return {
    issues: Array.from(new Set(issues)),
    warnings: Array.from(new Set(warnings)),
    offendingFiles: Array.from(new Set(offendingFiles.filter(Boolean))),
  };
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

function buildRepairPrompt(params: {
  userDescription: string;
  issues: string[];
  offendingFiles: string[];
  currentFiles: Record<string, string>;
}): string {
  const { userDescription, issues, offendingFiles, currentFiles } = params;
  const uniqueOffenders = Array.from(new Set(offendingFiles)).slice(0, 8);
  const fileSnippets = uniqueOffenders
    .map((p) => {
      const c = currentFiles[p];
      if (!c) return null;
      // Keep context small (avoid token blowups)
      const clipped = c.length > 3500 ? c.slice(0, 3500) + '\n/* ...truncated... */\n' : c;
      return `FILE: ${p}\n---\n${clipped}\n---`;
    })
    .filter(Boolean)
    .join('\n\n');

  return (
    'You previously generated a Vite + React + TypeScript project JSON, but it failed the preview styling baseline.\n' +
    'Return ONLY valid JSON (no markdown), in this exact schema:\n' +
    '{ "name": string, "description": string, "files": { "path": "file contents" } }\n\n' +
    'Fix ALL issues below while keeping the user-requested functionality.\n' +
    'CRITICAL constraints:\n' +
    '- Plain CSS only. NO Tailwind utilities, NO @tailwind, NO postcss.\n' +
    '- Ensure src/index.css exists and is non-trivial, and src/main.tsx imports "./index.css".\n' +
    '- Keep dependencies minimal (react, react-dom only).\n\n' +
    `User request:\n${userDescription}\n\n` +
    `Issues:\n- ${issues.join('\n- ')}\n\n` +
    (fileSnippets ? `Relevant files (edit these as needed):\n${fileSnippets}\n\n` : '') +
    'Return the COMPLETE corrected project JSON (include all required files).'
  );
}

async function geminiJson<T>(prompt: string, { model }: { model: string }): Promise<T> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

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
    throw new Error(`Gemini error ${resp.status}: ${t || resp.statusText}`);
  }

  const data = (await resp.json()) as GeminiGenerateContentResponse;
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return extractJsonObject(text) as T;
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
        `import React from 'react';\n\ntype Feature = { title: string; desc: string };\n\nconst features: Feature[] = [\n  { title: 'Clean layout', desc: 'Consistent spacing, readable typography, and a centered container.' },\n  { title: 'Real styling', desc: 'Plain CSS (no Tailwind) with buttons, inputs, and surfaces.' },\n  { title: 'Preview-friendly', desc: 'Works reliably inside the preview runtime with minimal dependencies.' },\n];\n\nexport default function App() {\n  return (\n    <div className=\"app\">\n      <header className=\"hero\">\n        <div className=\"container\">\n          <p className=\"badge\">Generated UI</p>\n          <h1 className=\"title\">${safeDesc || 'Your app is ready.'}</h1>\n          <p className=\"subtitle\">A styled baseline so the UI never looks broken, even for short prompts.</p>\n\n          <div className=\"heroActions\">\n            <button className=\"btn btnPrimary\" type=\"button\">Primary action</button>\n            <a className=\"btn btnGhost\" href=\"#content\">See sections</a>\n          </div>\n\n          <div className=\"heroForm\">\n            <label className=\"field\">\n              <span className=\"fieldLabel\">Example input</span>\n              <input className=\"input\" placeholder=\"Type here...\" />\n            </label>\n            <button className=\"btn btnSecondary\" type=\"button\">Submit</button>\n          </div>\n        </div>\n      </header>\n\n      <main id=\"content\" className=\"main\">\n        <div className=\"container\">\n          <section className=\"grid\">\n            {features.map((f) => (\n              <article key={f.title} className=\"card\">\n                <h2 className=\"cardTitle\">{f.title}</h2>\n                <p className=\"cardDesc\">{f.desc}</p>\n              </article>\n            ))}\n          </section>\n\n          <section className=\"panel\">\n            <h2 className=\"panelTitle\">Next step</h2>\n            <p className=\"panelDesc\">Describe what you want to build, and generation will keep CSS + layout consistent.</p>\n          </section>\n        </div>\n      </main>\n\n      <footer className=\"footer\">\n        <div className=\"container\">\n          <span className=\"muted\">Generated App • Plain CSS baseline</span>\n        </div>\n      </footer>\n    </div>\n  );\n}\n`,
      'src/index.css':
        `/* Styled fallback baseline (plain CSS; preview-friendly) */\n\n:root {\n  --bg: 216 33% 97%;\n  --fg: 222 28% 12%;\n  --muted: 220 12% 45%;\n\n  --card: 0 0% 100%;\n  --border: 220 18% 88%;\n\n  --primary: 250 84% 54%;\n  --primary-ink: 0 0% 100%;\n  --secondary: 205 86% 45%;\n  --secondary-ink: 0 0% 100%;\n\n  --ring: 250 84% 54%;\n\n  --radius: 16px;\n  --shadow: 0 18px 50px -25px hsl(222 28% 12% / 0.25);\n  --shadow-soft: 0 10px 30px -18px hsl(222 28% 12% / 0.20);\n\n  --font: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, \"Apple Color Emoji\", \"Segoe UI Emoji\";\n}\n\n* { box-sizing: border-box; }\n\nhtml, body { height: 100%; }\n\nbody {\n  margin: 0;\n  font-family: var(--font);\n  color: hsl(var(--fg));\n  background: radial-gradient(1200px 600px at 20% -10%, hsl(var(--primary) / 0.14), transparent 55%),\n              radial-gradient(900px 500px at 85% 0%, hsl(var(--secondary) / 0.10), transparent 60%),\n              hsl(var(--bg));\n}\n\na { color: inherit; }\n\n.container {\n  width: min(1100px, calc(100% - 40px));\n  margin: 0 auto;\n}\n\n.app { min-height: 100vh; display: flex; flex-direction: column; }\n\n.hero {\n  padding: 64px 0 32px;\n}\n\n.badge {\n  display: inline-block;\n  margin: 0 0 14px;\n  padding: 6px 10px;\n  border-radius: 999px;\n  border: 1px solid hsl(var(--border));\n  background: hsl(var(--card) / 0.75);\n  box-shadow: var(--shadow-soft);\n  font-size: 12px;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n}\n\n.title {\n  margin: 0;\n  font-size: clamp(34px, 4vw, 54px);\n  line-height: 1.05;\n  letter-spacing: -0.02em;\n}\n\n.subtitle {\n  margin: 12px 0 0;\n  max-width: 62ch;\n  color: hsl(var(--muted));\n  font-size: 16px;\n  line-height: 1.6;\n}\n\n.heroActions {\n  display: flex;\n  gap: 12px;\n  flex-wrap: wrap;\n  margin-top: 20px;\n}\n\n.heroForm {\n  margin-top: 22px;\n  padding: 14px;\n  border-radius: var(--radius);\n  border: 1px solid hsl(var(--border));\n  background: hsl(var(--card) / 0.78);\n  box-shadow: var(--shadow-soft);\n  display: flex;\n  gap: 12px;\n  align-items: end;\n  flex-wrap: wrap;\n}\n\n.field { display: grid; gap: 8px; min-width: 260px; flex: 1; }\n\n.fieldLabel {\n  font-size: 12px;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n  color: hsl(var(--muted));\n}\n\n.input {\n  width: 100%;\n  padding: 12px 12px;\n  border-radius: 12px;\n  border: 1px solid hsl(var(--border));\n  background: hsl(var(--card));\n  color: hsl(var(--fg));\n  outline: none;\n}\n\n.input:focus {\n  border-color: hsl(var(--ring));\n  box-shadow: 0 0 0 4px hsl(var(--ring) / 0.18);\n}\n\n.btn {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  border: 1px solid transparent;\n  border-radius: 12px;\n  padding: 11px 14px;\n  font-weight: 600;\n  text-decoration: none;\n  cursor: pointer;\n  transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease, border-color 120ms ease;\n  user-select: none;\n}\n\n.btn:active { transform: translateY(1px); }\n\n.btnPrimary {\n  background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)));\n  color: hsl(var(--primary-ink));\n  box-shadow: 0 14px 40px -22px hsl(var(--primary) / 0.55);\n}\n\n.btnPrimary:hover { box-shadow: 0 18px 48px -24px hsl(var(--primary) / 0.62); }\n\n.btnSecondary {\n  background: hsl(var(--fg));\n  color: hsl(var(--primary-ink));\n  box-shadow: var(--shadow-soft);\n}\n\n.btnGhost {\n  background: hsl(var(--card) / 0.55);\n  border-color: hsl(var(--border));\n  color: hsl(var(--fg));\n}\n\n.main { padding: 24px 0 54px; }\n\n.grid {\n  display: grid;\n  grid-template-columns: repeat(12, 1fr);\n  gap: 14px;\n}\n\n.card {\n  grid-column: span 12;\n  padding: 18px;\n  border-radius: var(--radius);\n  border: 1px solid hsl(var(--border));\n  background: hsl(var(--card));\n  box-shadow: var(--shadow);\n}\n\n@media (min-width: 800px) {\n  .card { grid-column: span 4; }\n}\n\n.cardTitle {\n  margin: 0;\n  font-size: 18px;\n  letter-spacing: -0.01em;\n}\n\n.cardDesc {\n  margin: 8px 0 0;\n  color: hsl(var(--muted));\n  line-height: 1.6;\n}\n\n.panel {\n  margin-top: 16px;\n  padding: 20px;\n  border-radius: var(--radius);\n  border: 1px solid hsl(var(--border));\n  background: linear-gradient(135deg, hsl(var(--card)), hsl(var(--card) / 0.70));\n  box-shadow: var(--shadow-soft);\n}\n\n.panelTitle { margin: 0; font-size: 16px; }\n\n.panelDesc { margin: 8px 0 0; color: hsl(var(--muted)); line-height: 1.6; }\n\n.footer {\n  margin-top: auto;\n  padding: 22px 0;\n  border-top: 1px solid hsl(var(--border));\n  background: hsl(var(--card) / 0.55);\n}\n\n.muted { color: hsl(var(--muted)); font-size: 13px; }\n`,
    },
  };
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

    let generated: GeminiGenerateShape;
    let validation: StyleValidation | null = null;
    const basePrompt = buildPreviewCompatiblePrompt(description);

    // Attempt 1: generate
    try {
      generated = await geminiJson<GeminiGenerateShape>(basePrompt, { model });
      if (!generated?.files || typeof generated.files !== 'object') {
        generated = fallbackProject(description);
      }
    } catch {
      generated = fallbackProject(description);
    }

    // Validate styling baseline; if it fails, attempt one repair
    if (generated?.files) {
      validation = validateStylingBaseline(generated.files);
      if (validation.issues.length > 0) {
        try {
          const repairPrompt = buildRepairPrompt({
            userDescription: description,
            issues: validation.issues,
            offendingFiles: validation.offendingFiles,
            currentFiles: generated.files,
          });
          const repaired = await geminiJson<GeminiGenerateShape>(repairPrompt, { model });
          if (repaired?.files && typeof repaired.files === 'object') {
            generated = repaired;
          }
        } catch {
          // ignore repair errors; we'll fall through to final validation/fallback
        }

        const revalidation = validateStylingBaseline(generated.files ?? {});
        validation = revalidation;
        if (revalidation.issues.length > 0) {
          generated = fallbackProject(description);
          validation = validateStylingBaseline(generated.files);
        }
      }
    }

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

    const { error: verErr } = await supabase.from('versions').insert({
      id: versionId,
      project_id: projectId,
      message: description,
      project_state: projectState,
      diffs: [],
      change_summary: null,
    });
    if (verErr) throw verErr;

    const version: SerializedVersion = {
      id: versionId,
      projectId,
      prompt: description,
      timestamp: nowIso,
      files: projectState.files,
      diffs: [],
      parentVersionId: null,
    };

    return new Response(JSON.stringify({ success: true, projectState, version, warnings: validation?.warnings ?? [] }), {
      status: 201,
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
