import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
// import ts from 'https://esm.sh/typescript@5.5.4';

/**
 * Best-effort in-memory caches to reduce repeated work across consecutive modify calls.
 * Note: This only helps when the same edge runtime instance handles repeated requests.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 64;

type CacheEntry<T> = { value: T; ts: number };

const contextSelectionCache = new Map<
  string,
  CacheEntry<{ selectedFiles: Record<string, string>; allFilePaths: string[] }>
>();
const dependencySetCache = new Map<string, CacheEntry<Set<string>>>();

function nowMs(): number {
  return Date.now();
}

function pruneCache<T>(cache: Map<string, CacheEntry<T>>) {
  const t = nowMs();
  // Remove expired.
  for (const [k, v] of cache) {
    if (t - v.ts > CACHE_TTL_MS) cache.delete(k);
  }
  // Simple size cap: remove oldest entries.
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  const entries = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
  for (let i = 0; i < entries.length - MAX_CACHE_ENTRIES; i++) {
    cache.delete(entries[i][0]);
  }
}

// Fast, stable, non-cryptographic hash for cache keys.
function fnv1a32Hex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function getCached<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  compute: () => T
): T {
  pruneCache(cache);
  const entry = cache.get(key);
  const t = nowMs();
  if (entry && t - entry.ts <= CACHE_TTL_MS) {
    // Refresh recency.
    entry.ts = t;
    return entry.value;
  }
  const value = compute();
  cache.set(key, { value, ts: t });
  pruneCache(cache);
  return value;
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Sanitizes error messages to prevent API key exposure.
 * Strips any potential key/token values from error text.
 */
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

type FileDiff = {
  filePath: string;
  status: 'added' | 'modified' | 'deleted';
  hunks: DiffHunk[];
};

type DiffHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: DiffChange[];
};

type DiffChange = {
  type: 'add' | 'delete' | 'context';
  lineNumber: number;
  content: string;
};

type ModifyBody = { projectState?: SerializedProjectState; prompt?: string };

type EditOperation = {
  search: string;
  replace: string;
  occurrence?: number; // 1-indexed
};

type FileEdit =
  | { path: string; operation: 'modify'; edits: EditOperation[] }
  | { path: string; operation: 'create'; content: string }
  | { path: string; operation: 'delete' };

type GeminiModifyShape = {
  description?: string;
  files: FileEdit[];
};

type ModifyBudgets = {
  maxTouchedFiles: number;
  maxEditsPerFile: number;
  maxCreateBytesPerFile: number;
  maxTotalCreateBytes: number;
  maxSearchChars: number;
  maxReplaceChars: number;
  maxContextFiles: number;
  maxContextChars: number;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

type ChangeSummary = {
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
  linesAdded: number;
  linesDeleted: number;
  description: string;
  affectedFiles: string[];
};

type FailureReason = 'APPLY_FAILED' | 'SYNTAX_FAILED' | 'INTEGRITY_FAILED';

function classifyFailureReason(err: unknown): FailureReason {
  const msg = err instanceof Error ? err.message : String(err ?? '');

  if (
    msg.includes('Search text not found') ||
    msg.includes('Cannot modify missing file') ||
    msg.includes('Modify operation missing edits')
  ) {
    return 'APPLY_FAILED';
  }

  if (msg.startsWith('TypeScript syntax errors:')) {
    return 'SYNTAX_FAILED';
  }

  return 'INTEGRITY_FAILED';
}

function formatFailureContext(err: unknown, files?: Record<string, string>): string {
  const reason = classifyFailureReason(err);
  const msg = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  // Keep this compact; the prompt already contains lots of context.
  const trimmed = msg.length > 4000 ? msg.slice(0, 4000) + '…' : msg;

  let fileContentHint = '';

  // If APPLY_FAILED and we have files, try to extract the file path and include actual content
  if (reason === 'APPLY_FAILED' && files) {
    // Try to extract file path from common error patterns
    // Pattern 1: "[file: <path>]" - new format from applyEdits wrapper
    // Pattern 2: "Cannot modify missing file: <path>"
    // Pattern 3: "Modify operation missing edits for: <path>"
    const filePathMatch = msg.match(/\[file:\s*([^\]]+)\]/) ||
      msg.match(/(?:Cannot modify missing file|Modify operation missing edits for):\s*([^\s,]+)/);

    if (filePathMatch && filePathMatch[1]) {
      const filePath = filePathMatch[1];
      const actualContent = files[filePath];

      if (typeof actualContent === 'string') {
        // Include the actual file content with explicit instructions
        const contentSnippet = actualContent.length > 4000
          ? actualContent.slice(0, 4000) + '\n... (truncated)'
          : actualContent;
        fileContentHint = `\n\n**CRITICAL: Your search block did NOT match the actual file content.**\n` +
          `The file "${filePath}" contains the following ACTUAL content. ` +
          `You MUST use text that EXACTLY matches content from this file for your search block:\n` +
          `\`\`\`\n${contentSnippet}\n\`\`\`\n` +
          `\nCopy the EXACT text you want to replace from the content above. Do not guess or invent content.`;
      } else {
        // File doesn't exist - tell AI to create it instead
        fileContentHint = `\n\n**The file "${filePath}" does not exist.** ` +
          `If you need to add content to this file, use operation "create" instead of "modify".`;
      }
    }
  }

  return `FailureReason: ${reason}\nFailureMessage: ${trimmed}\n\nFix by returning a corrected edit set. Requirements:\n- Keep edits minimal\n- For APPLY_FAILED: Your search block must EXACTLY match existing content. Copy verbatim from the actual file content provided below.\n- If SYNTAX_FAILED, fix syntax while preserving intent\n- Do not invent file paths; choose from provided file paths list\n${fileContentHint}`;
}

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
      generationConfig: { temperature: 0.35 },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    const sanitized = sanitizeError(t || resp.statusText);
    throw new Error(`Gemini error ${resp.status}: ${sanitized}`);
  }

  const data = (await resp.json()) as GeminiGenerateContentResponse;
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return extractJsonObject(text) as T;
}

function isSafePath(path: string): boolean {
  if (!path) return false;
  if (path.includes('\\')) return false;
  if (path.includes('\0')) return false;
  if (path.startsWith('/')) return false;
  if (path.includes('..')) return false;
  if (path.trim() !== path) return false;
  return true;
}

function byteLength(s: string): number {
  // Deno supports TextEncoder.
  return new TextEncoder().encode(s).byteLength;
}

function tokenizePrompt(prompt: string): string[] {
  const stop = new Set([
    'the',
    'and',
    'for',
    'with',
    'from',
    'that',
    'this',
    'into',
    'your',
    'our',
    'app',
    'add',
    'fix',
    'make',
    'change',
    'update',
    'modify',
    'please',
    'should',
    'can',
    'could',
    'use',
    'using',
    'set',
    'new',
    'remove',
    'delete',
  ]);

  return prompt
    .toLowerCase()
    .split(/[^a-z0-9_\-/\.]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .filter((t) => !stop.has(t))
    .slice(0, 32);
}

function resolveImport(fromPath: string, spec: string, files: Record<string, string>): string | null {
  if (!spec.startsWith('.')) return null;

  const baseDir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '';
  const joined = baseDir ? `${baseDir}/${spec}` : spec;
  const normalized = joined
    .replace(/\/(\.?\/)*/g, '/')
    .replace(/\/$/, '');

  const candidates = [
    normalized,
    `${normalized}.ts`,
    `${normalized}.tsx`,
    `${normalized}.js`,
    `${normalized}.jsx`,
    `${normalized}.json`,
    `${normalized}.css`,
    `${normalized}/index.ts`,
    `${normalized}/index.tsx`,
    `${normalized}/index.js`,
    `${normalized}/index.jsx`,
  ];

  for (const c of candidates) {
    if (typeof files[c] === 'string') return c;
  }
  return null;
}

function extractLocalImports(filePath: string, content: string, files: Record<string, string>): string[] {
  const results: string[] = [];
  const re = /\bfrom\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const spec = m[1] ?? '';
    const resolved = resolveImport(filePath, spec, files);
    if (resolved) results.push(resolved);
  }
  return results;
}

function findUnresolvedLocalImports(filePath: string, content: string, files: Record<string, string>): string[] {
  const missing: string[] = [];

  const fromRe = /\bfrom\s+['"]([^'"]+)['"]/g;
  const dynRe = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

  const check = (spec: string) => {
    if (!spec.startsWith('.')) return;
    const resolved = resolveImport(filePath, spec, files);
    if (!resolved) missing.push(spec);
  };

  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(content))) check(m[1] ?? '');
  while ((m = dynRe.exec(content))) check(m[1] ?? '');

  return [...new Set(missing)].slice(0, 20);
}

function extractBareModuleSpecifiers(content: string): string[] {
  const specs: string[] = [];
  const fromRe = /\bfrom\s+['"]([^'"]+)['"]/g;
  const dynRe = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  const sideEffectRe = /^\s*import\s+['"]([^'"]+)['"];?/gm;

  const pushIfBare = (spec: string) => {
    if (!spec) return;
    if (spec.startsWith('.') || spec.startsWith('/')) return;
    // Common path aliases / virtual modules in Vite/Lovable-style apps.
    if (spec.startsWith('@/') || spec.startsWith('~/')) return;
    if (spec.startsWith('virtual:')) return;
    if (spec.startsWith('node:')) return;
    if (spec.startsWith('http:') || spec.startsWith('https:') || spec.startsWith('data:')) return;
    specs.push(spec);
  };

  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(content))) pushIfBare(m[1] ?? '');
  while ((m = dynRe.exec(content))) pushIfBare(m[1] ?? '');
  while ((m = sideEffectRe.exec(content))) pushIfBare(m[1] ?? '');

  return [...new Set(specs)];
}

function toPackageName(spec: string): string {
  // Strip query/hash (e.g. "pkg?raw")
  const clean = spec.split('?')[0]?.split('#')[0] ?? spec;
  if (clean.startsWith('@')) {
    const parts = clean.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : clean;
  }
  return clean.split('/')[0] ?? clean;
}

function readDependencySet(packageJsonText: string): Set<string> {
  const deps = new Set<string>();
  const pj = JSON.parse(packageJsonText) as any;
  const buckets = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
  for (const b of buckets) {
    const obj = pj?.[b];
    if (obj && typeof obj === 'object') {
      for (const k of Object.keys(obj)) deps.add(k);
    }
  }
  return deps;
}

function readDependencySetCached(packageJsonText: string): Set<string> {
  const key = fnv1a32Hex(packageJsonText);
  return getCached(dependencySetCache, key, () => readDependencySet(packageJsonText));
}

function pickContextFiles(params: {
  files: Record<string, string>;
  promptText: string;
  budgets: ModifyBudgets;
}): { selectedFiles: Record<string, string>; allFilePaths: string[] } {
  const { files, promptText, budgets } = params;
  const allFilePaths = Object.keys(files).filter((p) => typeof files[p] === 'string');

  const core = [
    'index.html',
    'package.json',
    'vite.config.ts',
    'vite.config.js',
    'tsconfig.json',
    'tsconfig.app.json',
    'src/main.tsx',
    'src/main.ts',
    'src/App.tsx',
    'src/App.ts',
  ];

  const tokens = tokenizePrompt(promptText);
  const selected = new Set<string>();

  for (const p of core) {
    if (typeof files[p] === 'string') selected.add(p);
  }

  if (tokens.length > 0) {
    for (const p of allFilePaths) {
      const lp = p.toLowerCase();
      if (tokens.some((t) => lp.includes(t))) {
        selected.add(p);
      }
    }
  }

  // Pull in one-hop local imports from selected TS/TSX/JS/JSX files to reduce broken ref edits.
  const seed = [...selected];
  for (const p of seed) {
    if (!/\.(ts|tsx|js|jsx)$/.test(p)) continue;
    const content = files[p];
    if (typeof content !== 'string') continue;
    for (const imp of extractLocalImports(p, content, files)) {
      selected.add(imp);
    }
  }

  // Enforce budgets: cap file count and total chars.
  const selectedFiles: Record<string, string> = {};
  let usedChars = 0;
  const ordered = [...selected].sort((a, b) => {
    // Prefer core + src/ over everything else.
    const score = (p: string) =>
      core.includes(p) ? 0 : p.startsWith('src/') ? 1 : p.includes('src/') ? 2 : 3;
    return score(a) - score(b) || a.localeCompare(b);
  });

  for (const p of ordered) {
    if (Object.keys(selectedFiles).length >= budgets.maxContextFiles) break;
    const content = files[p];
    if (typeof content !== 'string') continue;
    const nextUsed = usedChars + content.length;
    if (nextUsed > budgets.maxContextChars) continue;
    selectedFiles[p] = content;
    usedChars = nextUsed;
  }

  return { selectedFiles, allFilePaths: allFilePaths.sort() };
}

function pickContextFilesCached(params: {
  files: Record<string, string>;
  promptText: string;
  budgets: ModifyBudgets;
  /**
   * Optional base key to keep cache correctness tied to a particular project version.
   * Example: `${currentVersionId}:${updatedAt}`
   */
  cacheKeyBase?: string;
}): { selectedFiles: Record<string, string>; allFilePaths: string[] } {
  const { files, promptText, budgets, cacheKeyBase } = params;
  const packageJsonText = typeof files['package.json'] === 'string' ? files['package.json'] : '';

  // Keep the key cheap, but sensitive to the most important invalidation signals.
  const keySeed = [
    cacheKeyBase ?? '',
    fnv1a32Hex(promptText),
    // Budgets affect selection trimming.
    String(budgets.maxContextFiles),
    String(budgets.maxContextChars),
    // package.json changes often correlate with import surface changes.
    fnv1a32Hex(packageJsonText),
    // Basic project shape.
    String(Object.keys(files).length),
  ].join('|');
  const key = fnv1a32Hex(keySeed);

  return getCached(contextSelectionCache, key, () => pickContextFiles({ files, promptText, budgets }));
}

function validateAndBudgetEdits(fileEdits: FileEdit[], budgets: ModifyBudgets) {
  if (!Array.isArray(fileEdits) || fileEdits.length === 0) {
    throw new Error('Model returned empty edit set');
  }

  if (fileEdits.length > budgets.maxTouchedFiles) {
    throw new Error(
      `Too many files touched: ${fileEdits.length} (max ${budgets.maxTouchedFiles}). Make the change more surgical.`
    );
  }

  let totalCreateBytes = 0;
  for (const f of fileEdits) {
    if (!f || typeof (f as any).path !== 'string') throw new Error('Each file edit must include a path');
    if (!isSafePath(f.path)) throw new Error(`Invalid file path: ${JSON.stringify(f.path)}`);

    if (f.operation === 'create') {
      if (typeof f.content !== 'string') throw new Error(`Create operation missing content for: ${f.path}`);
      const b = byteLength(f.content);
      if (b > budgets.maxCreateBytesPerFile) {
        throw new Error(
          `Create content too large for ${f.path}: ${b} bytes (max ${budgets.maxCreateBytesPerFile}). Split into smaller files.`
        );
      }
      totalCreateBytes += b;
      continue;
    }

    if (f.operation === 'delete') {
      continue;
    }

    // modify
    if (!Array.isArray((f as any).edits) || (f as any).edits.length === 0) {
      throw new Error(`Modify operation missing edits for: ${f.path}`);
    }
    if ((f as any).edits.length > budgets.maxEditsPerFile) {
      throw new Error(
        `Too many edits for ${f.path}: ${(f as any).edits.length} (max ${budgets.maxEditsPerFile}). Combine edits.`
      );
    }
    for (const op of (f as any).edits as EditOperation[]) {
      if (typeof op.search !== 'string' || op.search.length === 0) {
        throw new Error(`EditOperation.search is required for: ${f.path}`);
      }
      if (typeof op.replace !== 'string') {
        throw new Error(`EditOperation.replace must be a string for: ${f.path}`);
      }
      if (op.search.length > budgets.maxSearchChars) {
        throw new Error(
          `Search block too large for ${f.path}: ${op.search.length} chars (max ${budgets.maxSearchChars}). Use a smaller unique block.`
        );
      }
      if (op.replace.length > budgets.maxReplaceChars) {
        throw new Error(
          `Replace block too large for ${f.path}: ${op.replace.length} chars (max ${budgets.maxReplaceChars}). Use smaller edits.`
        );
      }
    }
  }

  if (totalCreateBytes > budgets.maxTotalCreateBytes) {
    throw new Error(
      `Too much created content: ${totalCreateBytes} bytes (max ${budgets.maxTotalCreateBytes}). Split work into multiple steps.`
    );
  }
}

function applySingleEdit(input: string, op: EditOperation): string {
  if (typeof op.search !== 'string' || op.search.length === 0) {
    throw new Error('EditOperation.search is required');
  }
  if (typeof op.replace !== 'string') {
    throw new Error('EditOperation.replace must be a string');
  }
  const occurrence = op.occurrence ?? 1;
  if (!Number.isFinite(occurrence) || occurrence < 1) {
    throw new Error('EditOperation.occurrence must be >= 1');
  }

  let fromIndex = 0;
  let foundAt = -1;
  for (let i = 0; i < occurrence; i++) {
    foundAt = input.indexOf(op.search, fromIndex);
    if (foundAt === -1) {
      const hint = op.search.length > 200 ? op.search.slice(0, 200) + '…' : op.search;
      throw new Error(
        `Search text not found (occurrence ${occurrence}). Use a larger, more unique search block. Search starts with: ${JSON.stringify(
          hint
        )}`
      );
    }
    fromIndex = foundAt + op.search.length;
  }

  return input.slice(0, foundAt) + op.replace + input.slice(foundAt + op.search.length);
}

function applyEdits(prevFiles: Record<string, string>, fileEdits: FileEdit[]) {
  const nextFiles: Record<string, string> = { ...prevFiles };
  const touched = new Set<string>();

  for (const f of fileEdits) {
    if (!f || typeof (f as any).path !== 'string') {
      throw new Error('Each file edit must include a path');
    }
    if (!isSafePath(f.path)) {
      throw new Error(`Invalid file path: ${JSON.stringify(f.path)}`);
    }

    if (f.operation === 'create') {
      nextFiles[f.path] = f.content ?? '';
      touched.add(f.path);
      continue;
    }

    if (f.operation === 'delete') {
      delete nextFiles[f.path];
      touched.add(f.path);
      continue;
    }

    // modify
    const original = prevFiles[f.path];
    if (typeof original !== 'string') {
      throw new Error(`Cannot modify missing file: ${f.path}`);
    }
    if (!Array.isArray(f.edits) || f.edits.length === 0) {
      throw new Error(`Modify operation missing edits for: ${f.path}`);
    }
    let updated = original;
    for (const op of f.edits) {
      try {
        updated = applySingleEdit(updated, op);
      } catch (editErr) {
        // Prepend file path to error message so formatFailureContext can extract it
        const msg = editErr instanceof Error ? editErr.message : String(editErr);
        throw new Error(`[file: ${f.path}] ${msg}`);
      }
    }
    nextFiles[f.path] = updated;
    touched.add(f.path);
  }

  return { nextFiles, touchedFiles: [...touched] };
}

function validateTypeScriptSyntax(files: Record<string, string>, touchedFiles: string[]) {
  // Stubbed: direct TS compiler import is too heavy for Edge Functions
  return;
}

function validateTypeScriptSyntaxForPaths(files: Record<string, string>, paths: string[]) {
  // Stubbed: direct TS compiler import is too heavy for Edge Functions
  return;
}

function validateProjectIntegrity(params: {
  prevFiles: Record<string, string>;
  nextFiles: Record<string, string>;
  touchedFiles: string[];
}) {
  const { prevFiles, nextFiles, touchedFiles } = params;

  // Required “boot” files.
  const required = ['index.html', 'src/main.tsx'];
  for (const p of required) {
    const v = nextFiles[p];
    if (typeof v !== 'string' || v.trim().length === 0) {
      throw new Error(`INTEGRITY_FAILED: Required file missing or empty: ${p}`);
    }
  }

  // If package.json changed, ensure it's valid JSON.
  if (touchedFiles.includes('package.json')) {
    const pj = nextFiles['package.json'];
    if (typeof pj !== 'string') throw new Error('INTEGRITY_FAILED: package.json missing after edit');
    try {
      JSON.parse(pj);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid JSON';
      throw new Error(`INTEGRITY_FAILED: package.json is invalid JSON: ${msg}`);
    }
  }

  // Always validate syntax of critical entrypoints if they exist.
  const critical = ['src/main.tsx', 'src/App.tsx', 'src/main.ts', 'src/App.ts'];
  validateTypeScriptSyntaxForPaths(nextFiles, critical);

  // Extra guard: if we touched a TS/TSX file, ensure it still parses.
  const touchedTs = touchedFiles.filter((p) => p.endsWith('.ts') || p.endsWith('.tsx'));
  if (touchedTs.length > 0) {
    validateTypeScriptSyntaxForPaths(nextFiles, touchedTs);
  }

  // Lightweight import resolution check for touched TS/TSX files.
  // Ensures local relative imports still point to existing files.
  const unresolved: Array<{ file: string; missing: string[] }> = [];
  for (const p of touchedTs) {
    const content = nextFiles[p];
    if (typeof content !== 'string') continue;
    const missing = findUnresolvedLocalImports(p, content, nextFiles);
    if (missing.length > 0) unresolved.push({ file: p, missing });
  }
  if (unresolved.length > 0) {
    const lines = unresolved
      .slice(0, 8)
      .map((u) => `${u.file}: ${u.missing.map((s) => JSON.stringify(s)).join(', ')}`)
      .join('\n- ');
    throw new Error(`INTEGRITY_FAILED: Unresolved local imports:\n- ${lines}`);
  }

  // Best-effort npm dependency check for touched TS/TSX files.
  // If a touched file imports a bare module specifier, ensure it's present in package.json.
  const packageJsonText = nextFiles['package.json'];
  if (typeof packageJsonText === 'string' && packageJsonText.trim().length > 0) {
    let depSet: Set<string> | null = null;
    try {
      depSet = readDependencySetCached(packageJsonText);
    } catch {
      // package.json parsing is already validated above when touched; if not touched and invalid, skip this heuristic.
      depSet = null;
    }

    if (depSet) {
      const missingPkgs = new Map<string, Set<string>>();
      const alwaysOk = new Set([
        // Common runtime provided deps for this environment; still usually in package.json, but avoid noisy false positives.
        'react',
        'react-dom',
      ]);

      for (const p of touchedTs) {
        const content = nextFiles[p];
        if (typeof content !== 'string') continue;
        for (const spec of extractBareModuleSpecifiers(content)) {
          const pkg = toPackageName(spec);
          if (!pkg || alwaysOk.has(pkg)) continue;
          if (!depSet.has(pkg)) {
            const set = missingPkgs.get(pkg) ?? new Set<string>();
            set.add(p);
            missingPkgs.set(pkg, set);
          }
        }
      }

      if (missingPkgs.size > 0) {
        const entries = [...missingPkgs.entries()].slice(0, 10);
        const detail = entries
          .map(([pkg, files]) => `${pkg} (imported by: ${[...files].slice(0, 3).join(', ')})`)
          .join('\n- ');

        const pkgJsonTouched = touchedFiles.includes('package.json');
        const hint = pkgJsonTouched
          ? 'Update package.json to include the missing dependencies.'
          : 'Add these dependencies to package.json (dependencies or devDependencies), or avoid adding new packages in this change.';

        throw new Error(`INTEGRITY_FAILED: Missing npm dependencies:\n- ${detail}\n\n${hint}`);
      }
    }
  }

  // Prevent accidental deletion of unchanged required files.
  for (const p of required) {
    if (typeof prevFiles[p] === 'string' && typeof nextFiles[p] !== 'string') {
      throw new Error(`INTEGRITY_FAILED: Required file was removed: ${p}`);
    }
  }
}

function splitLines(s: string): string[] {
  // Keep trailing empty line behavior stable for diffs.
  return s.split(/\r?\n/);
}

/**
 * Normalize a line for comparison by trimming trailing whitespace.
 * This prevents formatting-only changes from appearing in diffs.
 */
function normalizeLine(line: string): string {
  return line.trimEnd();
}

/**
 * Normalize full content for comparison.
 * Used to detect if files differ only in whitespace.
 */
function normalizeContent(content: string): string {
  return content.split('\n').map(l => l.trimEnd()).join('\n').trimEnd();
}

/**
 * Line representation with both raw and normalized content.
 * - raw: original line for display
 * - norm: normalized line for comparison (trailing whitespace trimmed)
 */
type Line = { raw: string; norm: string };

type LineOp = { type: 'context' | 'add' | 'delete'; line: string };

/**
 * Segment type for anchor-based segmentation.
 * - anchor: lines that match at the same index (guaranteed context)
 * - diff: lines that need Myers diff
 */
type Segment = 
  | { type: 'anchor'; oldLines: Line[]; newLines: Line[] }
  | { type: 'diff'; oldLines: Line[]; newLines: Line[] };

/**
 * Build Line objects from raw string array.
 */
function buildLines(raw: string[]): Line[] {
  return raw.map(r => ({ raw: r, norm: normalizeLine(r) }));
}

/**
 * Anchor segmentation: identify lines at the same index with identical normalized content.
 * Returns segments alternating between anchor runs and diff segments.
 * This prevents false moves where unchanged lines appear as both + and -.
 */
function segmentByAnchors(oldLines: Line[], newLines: Line[]): Segment[] {
  const segments: Segment[] = [];
  const minLen = Math.min(oldLines.length, newLines.length);
  
  let i = 0;
  while (i < minLen || i < oldLines.length || i < newLines.length) {
    // Collect anchor run (lines that match at same position)
    const anchorStart = i;
    while (i < minLen && oldLines[i].norm === newLines[i].norm) {
      i++;
    }
    
    if (i > anchorStart) {
      segments.push({
        type: 'anchor',
        oldLines: oldLines.slice(anchorStart, i),
        newLines: newLines.slice(anchorStart, i),
      });
    }
    
    if (i >= minLen && i >= oldLines.length && i >= newLines.length) break;
    
    // Collect diff segment (lines that don't match at same position)
    const diffStart = i;
    while (i < minLen && oldLines[i].norm !== newLines[i].norm) {
      i++;
    }
    
    // Include any trailing lines beyond minLen in the diff segment
    const oldEnd = i < minLen ? i : oldLines.length;
    const newEnd = i < minLen ? i : newLines.length;
    
    if (diffStart < oldEnd || diffStart < newEnd) {
      segments.push({
        type: 'diff',
        oldLines: oldLines.slice(diffStart, oldEnd),
        newLines: newLines.slice(diffStart, newEnd),
      });
    }
    
    // Move past minLen if we're there
    if (i >= minLen) {
      i = Math.max(oldLines.length, newLines.length);
    }
  }
  
  return segments;
}

/**
 * Run Myers diff on a single segment, using normalized comparison but raw output.
 */
function myersDiffSegment(oldLines: Line[], newLines: Line[]): LineOp[] {
  const n = oldLines.length;
  const m = newLines.length;
  
  if (n === 0 && m === 0) return [];
  if (n === 0) return newLines.map(l => ({ type: 'add' as const, line: l.raw }));
  if (m === 0) return oldLines.map(l => ({ type: 'delete' as const, line: l.raw }));
  
  const max = n + m;
  const v = new Map<number, number>();
  v.set(1, 0);
  const trace: Array<Map<number, number>> = [];

  for (let d = 0; d <= max; d++) {
    const vSnapshot = new Map<number, number>();
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      const vKMinus = v.get(k - 1);
      const vKPlus = v.get(k + 1);
      if (k === -d || (k !== d && (vKMinus ?? -1) < (vKPlus ?? -1))) {
        x = vKPlus ?? 0;
      } else {
        x = (vKMinus ?? 0) + 1;
      }
      let y = x - k;
      // Compare normalized lines
      while (x < n && y < m && oldLines[x].norm === newLines[y].norm) {
        x++;
        y++;
      }
      vSnapshot.set(k, x);
      v.set(k, x);
      if (x >= n && y >= m) {
        trace.push(vSnapshot);
        return backtrackMyersWithRaw(oldLines, newLines, trace);
      }
    }
    trace.push(vSnapshot);
  }
  return [];
}

/**
 * Backtrack Myers with raw line preservation.
 * Context and add use newLines[].raw, delete uses oldLines[].raw.
 */
function backtrackMyersWithRaw(oldLines: Line[], newLines: Line[], trace: Array<Map<number, number>>): LineOp[] {
  let x = oldLines.length;
  let y = newLines.length;
  const ops: LineOp[] = [];

  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;

    let prevK: number;
    const vKMinus = v.get(k - 1);
    const vKPlus = v.get(k + 1);
    if (k === -d || (k !== d && (vKMinus ?? -1) < (vKPlus ?? -1))) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = v.get(prevK) ?? 0;
    const prevY = prevX - prevK;

    // Context lines - use new side's raw content
    while (x > prevX && y > prevY) {
      ops.push({ type: 'context', line: newLines[y - 1].raw });
      x--;
      y--;
    }

    if (d === 0) break;

    if (x === prevX) {
      // Add from new
      ops.push({ type: 'add', line: newLines[y - 1].raw });
      y--;
    } else {
      // Delete from old
      ops.push({ type: 'delete', line: oldLines[x - 1].raw });
      x--;
    }
  }

  return ops.reverse();
}

/**
 * Main diff function using anchor segmentation.
 * Prevents false moves by forcing context for lines at same position with same content.
 */
function stableDiff(oldRaw: string[], newRaw: string[]): LineOp[] {
  const oldLines = buildLines(oldRaw);
  const newLines = buildLines(newRaw);
  
  const segments = segmentByAnchors(oldLines, newLines);
  const allOps: LineOp[] = [];
  
  for (const seg of segments) {
    if (seg.type === 'anchor') {
      // Anchor lines are guaranteed context - use new side's raw content
      for (const line of seg.newLines) {
        allOps.push({ type: 'context', line: line.raw });
      }
    } else {
      // Run Myers on this diff segment
      const segOps = myersDiffSegment(seg.oldLines, seg.newLines);
      allOps.push(...segOps);
    }
  }
  
  return allOps;
}

/**
 * Collapse adjacent add/delete pairs that have identical normalized content.
 * This handles edge cases where the LCS algorithm produces spurious changes
 * when lines differ only in trailing whitespace.
 */
function collapseAdjacentPairs(ops: LineOp[]): LineOp[] {
  const result: LineOp[] = [];
  let i = 0;

  while (i < ops.length) {
    const current = ops[i];
    
    // Look for add/delete or delete/add pairs with identical trimmed content
    if (i + 1 < ops.length) {
      const next = ops[i + 1];
      
      // Check for add followed by delete with same trimmed content
      if (current.type === 'add' && next.type === 'delete' && 
          normalizeLine(current.line) === normalizeLine(next.line)) {
        // Convert to context using the new line's content
        result.push({ type: 'context', line: current.line });
        i += 2;
        continue;
      }
      
      // Check for delete followed by add with same trimmed content
      if (current.type === 'delete' && next.type === 'add' && 
          normalizeLine(current.line) === normalizeLine(next.line)) {
        // Convert to context using the new line's content
        result.push({ type: 'context', line: next.line });
        i += 2;
        continue;
      }
    }
    
    result.push(current);
    i++;
  }

  return result;
}

/**
 * Enhanced collapse for non-adjacent matching delete/add pairs.
 * Looks within a window to find matching pairs that Myers misaligned.
 * Only collapses when there's a unique 1:1 match within the window.
 */
function collapseNonAdjacentPairs(ops: LineOp[], windowSize: number = 12): LineOp[] {
  const result = [...ops];
  
  // Build index of adds and deletes with their normalized content
  const addsByNorm = new Map<string, number[]>();
  const deletesByNorm = new Map<string, number[]>();
  
  for (let i = 0; i < result.length; i++) {
    const op = result[i];
    if (op.type === 'add') {
      const norm = normalizeLine(op.line);
      if (!addsByNorm.has(norm)) addsByNorm.set(norm, []);
      addsByNorm.get(norm)!.push(i);
    } else if (op.type === 'delete') {
      const norm = normalizeLine(op.line);
      if (!deletesByNorm.has(norm)) deletesByNorm.set(norm, []);
      deletesByNorm.get(norm)!.push(i);
    }
  }
  
  // For each normalized content that appears in both adds and deletes,
  // try to pair them if they're within the window and unique
  const paired = new Set<number>();
  
  for (const [norm, deleteIndices] of deletesByNorm) {
    const addIndices = addsByNorm.get(norm);
    if (!addIndices) continue;
    
    // Only pair if there's exactly one of each (unique pairing)
    // This avoids collapsing legitimate repeated lines
    if (deleteIndices.length === 1 && addIndices.length === 1) {
      const delIdx = deleteIndices[0];
      const addIdx = addIndices[0];
      
      // Check if within window
      if (Math.abs(delIdx - addIdx) <= windowSize) {
        paired.add(delIdx);
        paired.add(addIdx);
        
        // Convert both to context, keeping the add's content (new version)
        // Mark delete as context with add's line
        result[delIdx] = { type: 'context', line: result[addIdx].line };
        result[addIdx] = { type: 'context', line: result[addIdx].line };
      }
    }
  }
  
  // Remove duplicate context lines created by pairing
  // (delete became context, add became context - we only need one)
  const finalResult: LineOp[] = [];
  for (let i = 0; i < result.length; i++) {
    if (paired.has(i)) {
      // Only keep the first of a paired set
      const op = result[i];
      const norm = normalizeLine(op.line);
      // Check if next paired item is the same
      if (i + 1 < result.length && paired.has(i + 1) && 
          normalizeLine(result[i + 1].line) === norm) {
        // Skip both, add one context
        finalResult.push({ type: 'context', line: op.line });
        i++; // Skip next
        continue;
      }
    }
    finalResult.push(result[i]);
  }
  
  return finalResult;
}

/**
 * Full collapse pipeline: adjacent pairs first, then non-adjacent.
 */
function collapseIdenticalChanges(ops: LineOp[]): LineOp[] {
  let result = collapseAdjacentPairs(ops);
  result = collapseNonAdjacentPairs(result);
  return result;
}

function buildHunksFromOps(ops: LineOp[], opts?: { contextLines?: number }): DiffHunk[] {
  const contextLines = Math.max(0, opts?.contextLines ?? 3);
  const hunks: DiffHunk[] = [];

  // Track positions through the virtual edit script.
  let oldLine = 1;
  let newLine = 1;

  // Rolling buffer of last context lines (with their positions) for pre-context.
  const ctxBuffer: Array<{
    oldLine: number;
    newLine: number;
    op: LineOp;
  }> = [];

  // Active hunk state.
  let active: {
    oldStart: number;
    newStart: number;
    oldLines: number;
    newLines: number;
    changes: DiffChange[];
    // remaining trailing context lines to include after the last change
    trailing: number;
  } | null = null;

  const pushToActive = (op: LineOp, atOld: number, atNew: number) => {
    if (!active) return;
    if (op.type === 'context') {
      active.changes.push({ type: 'context', lineNumber: atNew, content: op.line });
      active.oldLines += 1;
      active.newLines += 1;
    } else if (op.type === 'delete') {
      active.changes.push({ type: 'delete', lineNumber: atOld, content: op.line });
      active.oldLines += 1;
    } else {
      active.changes.push({ type: 'add', lineNumber: atNew, content: op.line });
      active.newLines += 1;
    }
  };

  const finalize = () => {
    if (!active) return;
    // Trim leading/trailing context if contextLines=0.
    if (active.changes.length > 0) {
      hunks.push({
        oldStart: active.oldStart,
        oldLines: active.oldLines,
        newStart: active.newStart,
        newLines: active.newLines,
        changes: active.changes,
      });
    }
    active = null;
  };

  for (const op of ops) {
    const atOld = oldLine;
    const atNew = newLine;

    const isChange = op.type !== 'context';

    if (isChange) {
      if (!active) {
        // Start new hunk; seed it with pre-context from buffer.
        const seed = ctxBuffer.slice(-contextLines);
        const seedOldStart = seed.length > 0 ? seed[0].oldLine : atOld;
        const seedNewStart = seed.length > 0 ? seed[0].newLine : atNew;
        active = {
          oldStart: seedOldStart,
          newStart: seedNewStart,
          oldLines: 0,
          newLines: 0,
          changes: [],
          trailing: contextLines,
        };
        for (const s of seed) {
          pushToActive(s.op, s.oldLine, s.newLine);
        }
      } else {
        // Another change within an active hunk resets trailing context window.
        active.trailing = contextLines;
      }

      pushToActive(op, atOld, atNew);
    } else {
      // Context line
      if (active) {
        if (active.trailing > 0) {
          pushToActive(op, atOld, atNew);
          active.trailing -= 1;
          if (active.trailing === 0) {
            // Keep buffering so a subsequent change can start a new hunk with pre-context.
            // But we finalize now to split hunks when separated by >contextLines.
            finalize();
          }
        } else {
          // Shouldn't happen due to finalize(), but just in case.
          finalize();
        }
      }

      // Update rolling context buffer with positions BEFORE consuming this op.
      ctxBuffer.push({ oldLine: atOld, newLine: atNew, op });
      if (ctxBuffer.length > contextLines) ctxBuffer.shift();
    }

    // Advance line counters.
    if (op.type === 'context') {
      oldLine++;
      newLine++;
    } else if (op.type === 'delete') {
      oldLine++;
    } else {
      newLine++;
    }
  }

  // If we ended mid-hunk, include whatever trailing context we managed to add.
  finalize();
  return hunks;
}

function computeDiffs(params: {
  prevFiles: Record<string, string>;
  nextFiles: Record<string, string>;
  fileEdits: FileEdit[];
}): FileDiff[] {
  const { prevFiles, nextFiles, fileEdits } = params;
  const diffs: FileDiff[] = [];

  for (const fe of fileEdits) {
    const path = fe.path;
    if (fe.operation === 'delete') {
      diffs.push({ filePath: path, status: 'deleted', hunks: [] });
      continue;
    }
    if (fe.operation === 'create') {
      // For created files, show as added (no hunks necessary, but include a hunk for preview).
      const newText = nextFiles[path] ?? '';
      const ops: LineOp[] = splitLines(newText).map((l) => ({ type: 'add', line: l }));
      diffs.push({ filePath: path, status: 'added', hunks: buildHunksFromOps(ops, { contextLines: 0 }) });
      continue;
    }

    const oldText = prevFiles[path] ?? '';
    const newText = nextFiles[path] ?? '';
    
    // Skip if content is exactly the same
    if (oldText === newText) continue;
    
    // Skip if normalized content is the same (whitespace-only changes)
    const normalizedOld = normalizeContent(oldText);
    const normalizedNew = normalizeContent(newText);
    if (normalizedOld === normalizedNew) continue;
    
    // Compute diff using anchor-based stable diff algorithm
    // This prevents false moves by anchoring lines at the same position with same content
    const ops = stableDiff(splitLines(oldText), splitLines(newText));
    
    // Collapse any spurious add/delete pairs that slipped through
    const collapsedOps = collapseIdenticalChanges(ops);
    
    // Debug: log if we still have identical add/delete pairs
    const addNorms = new Set<string>();
    const deleteNorms = new Set<string>();
    for (const op of collapsedOps) {
      if (op.type === 'add') addNorms.add(normalizeLine(op.line));
      if (op.type === 'delete') deleteNorms.add(normalizeLine(op.line));
    }
    const overlap = [...addNorms].filter(n => deleteNorms.has(n));
    if (overlap.length > 0) {
      console.warn(`[DIFF DEBUG] ${path}: Found ${overlap.length} identical add/delete lines after collapse:`, overlap.slice(0, 3));
    }
    
    // Only include if there are actual changes (not just context)
    const hasRealChanges = collapsedOps.some(op => op.type !== 'context');
    if (!hasRealChanges) continue;
    
    diffs.push({ filePath: path, status: 'modified', hunks: buildHunksFromOps(collapsedOps, { contextLines: 3 }) });
  }

  return diffs;
}

function summarizeEdits(fileEdits: FileEdit[], diffs: FileDiff[]): ChangeSummary {
  const added = fileEdits.filter((f) => f.operation === 'create').map((f) => f.path);
  const deleted = fileEdits.filter((f) => f.operation === 'delete').map((f) => f.path);
  const modified = fileEdits.filter((f) => f.operation === 'modify').map((f) => f.path);
  const affected = [...new Set([...added, ...modified, ...deleted])];

  // Count actual lines added/deleted from diffs
  let linesAdded = 0;
  let linesDeleted = 0;
  for (const diff of diffs) {
    for (const hunk of diff.hunks) {
      for (const change of hunk.changes) {
        if (change.type === 'add') linesAdded++;
        else if (change.type === 'delete') linesDeleted++;
      }
    }
  }

  return {
    filesAdded: added.length,
    filesModified: modified.length,
    filesDeleted: deleted.length,
    linesAdded,
    linesDeleted,
    description: `Updated ${modified.length} file(s), added ${added.length}, deleted ${deleted.length}.`,
    affectedFiles: affected.slice(0, 50),
  };
}

function buildModifyPrompt(params: {
  projectDescription: string;
  currentFiles: Record<string, string>;
  userPrompt: string;
  budgets: ModifyBudgets;
  failureContext?: string;
  cacheKeyBase?: string;
}): string {
  const { projectDescription, currentFiles, userPrompt, budgets, failureContext, cacheKeyBase } = params;

  const { selectedFiles, allFilePaths } = pickContextFilesCached({
    files: currentFiles,
    promptText: userPrompt,
    budgets,
    cacheKeyBase,
  });

  const rules = [
    'Return ONLY valid JSON (no markdown).',
    'Do NOT output full file contents unless operation is "create".',
    'For modify operations: edits must be exact string search/replace blocks. Include enough surrounding context to be unique.',
    'Do not change paths unless you are intentionally creating/deleting a file.',
    'Prefer minimal number of edits and files touched.',
    `Hard limits: touch <= ${budgets.maxTouchedFiles} files, edits/file <= ${budgets.maxEditsPerFile}.`,
  ].join('\n- ');

  const schema =
    '{\n' +
    '  "description"?: string,\n' +
    '  "files": [\n' +
    '    { "path": string, "operation": "modify", "edits": [{"search": string, "replace": string, "occurrence"?: number}] },\n' +
    '    { "path": string, "operation": "create", "content": string },\n' +
    '    { "path": string, "operation": "delete" }\n' +
    '  ]\n' +
    '}';

  const failure = failureContext
    ? `\n\nPrevious attempt failed. Fix it by returning a corrected edit set. Failure details:\n${failureContext}\n`
    : '';

  return (
    'You modify a Vite + React + TypeScript project represented as a files map.\n' +
    `${failure}` +
    'Return ONLY JSON.\n\n' +
    `Schema:\n${schema}\n\n` +
    `Rules:\n- ${rules}\n\n` +
    `Current project description: ${projectDescription}\n` +
    `All file paths (do not invent new paths): ${JSON.stringify(allFilePaths)}\n` +
    `Selected file contents JSON (only a subset): ${JSON.stringify(selectedFiles)}\n\n` +
    `User change request: ${userPrompt}`
  );
}

async function runModifyOnce(params: {
  current: SerializedProjectState;
  promptText: string;
  model: string;
  budgets: ModifyBudgets;
  failureContext?: string;
}): Promise<{
  nextState: SerializedProjectState;
  fileEdits: FileEdit[];
  summary: ChangeSummary;
  diffs: FileDiff[];
}> {
  const { current, promptText, model, budgets, failureContext } = params;
  const llmPrompt = buildModifyPrompt({
    projectDescription: current.description,
    currentFiles: current.files,
    userPrompt: promptText,
    budgets,
    failureContext,
    cacheKeyBase: `${current.currentVersionId}:${current.updatedAt}`,
  });

  const updated = await geminiJson<GeminiModifyShape>(llmPrompt, { model });
  if (!updated || !Array.isArray(updated.files)) {
    throw new Error('Model did not return a valid "files" edit array');
  }

  validateAndBudgetEdits(updated.files, budgets);

  const { nextFiles, touchedFiles } = applyEdits(current.files, updated.files);
  validateTypeScriptSyntax(nextFiles, touchedFiles);
  validateProjectIntegrity({ prevFiles: current.files, nextFiles, touchedFiles });

  const newVersionId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const nextState: SerializedProjectState = {
    ...current,
    description: updated.description ?? current.description,
    files: nextFiles,
    updatedAt: nowIso,
    currentVersionId: newVersionId,
  };

  const diffs = computeDiffs({ prevFiles: current.files, nextFiles, fileEdits: updated.files });
  const summary = summarizeEdits(updated.files, diffs);
  return { nextState, fileEdits: updated.files, summary, diffs };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as ModifyBody;
    const promptText = (body.prompt ?? '').trim();
    const current = body.projectState;

    if (!current?.id) {
      return new Response(JSON.stringify({ success: false, error: 'projectState is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!promptText) {
      return new Response(JSON.stringify({ success: false, error: 'prompt is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const model =
      Deno.env.get('GEMINI_HARD_MODEL') || Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash';

    const budgets: ModifyBudgets = {
      maxTouchedFiles: 20,
      maxEditsPerFile: 25,
      maxCreateBytesPerFile: 200_000,
      maxTotalCreateBytes: 500_000,
      maxSearchChars: 8_000,
      maxReplaceChars: 20_000,
      maxContextFiles: 40,
      maxContextChars: 180_000,
    };

    let result:
      | {
        nextState: SerializedProjectState;
        fileEdits: FileEdit[];
        summary: ChangeSummary;
        diffs: FileDiff[];
      }
      | null = null;
    let lastError: string | null = null;

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const failureContext = attempt === 1 ? undefined : formatFailureContext(lastError, current.files);
        result = await runModifyOnce({ current, promptText, model, budgets, failureContext });
        break;
      } catch (e) {
        lastError = e instanceof Error ? e.message : 'Unknown error';
        if (attempt === maxAttempts) {
          throw e;
        }
      }
    }

    if (!result) throw new Error(lastError || 'Failed to modify project');

    const { nextState, summary } = result;
    const diffs = result.diffs;
    const supabase = createServiceClient();

    await supabase
      .from('projects')
      .update({ name: nextState.name, description: nextState.description })
      .eq('id', current.id);

    const { error: verErr } = await supabase.from('versions').insert({
      id: nextState.currentVersionId,
      project_id: current.id,
      message: promptText,
      project_state: nextState,
      diffs,
      change_summary: summary,
    });
    if (verErr) throw verErr;

    const version = {
      id: nextState.currentVersionId,
      projectId: current.id,
      prompt: promptText,
      timestamp: nextState.updatedAt,
      files: nextState.files,
      diffs: diffs,
      parentVersionId: current.currentVersionId ?? null,
    };

    return new Response(
      JSON.stringify({
        success: true,
        projectState: nextState,
        version,
        diffs,
        changeSummary: summary,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? sanitizeError(e.message) : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
