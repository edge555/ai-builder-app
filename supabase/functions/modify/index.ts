/**
 * Modify Edge Function (Self-Contained)
 * Handles modification requests with direct Gemini API calls.
 * No proxy layer - all logic runs in the edge function.
 */
import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createAuthClient } from '../_shared/supabase-client.ts';
import { sanitizeError } from '../_shared/error-utils.ts';
import { createGeminiClient, getModificationPrompt, MODIFICATION_OUTPUT_SCHEMA } from '../_shared/ai/index.ts';
import { applySearchReplace } from '../_shared/search-replace.ts';
import { computeFileDiff, type FileDiff } from '../_shared/diff-utils.ts';


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

interface FileEdit {
  search: string;
  replace: string;
  occurrence?: number;
}

interface FileOperation {
  path: string;
  operation: 'create' | 'modify' | 'delete';
  content?: string;
  edits?: FileEdit[];
}

interface ModificationOutput {
  files: FileOperation[];
}


/**
 * Heuristic file selector: scores files by keyword matches and selects top candidates.
 */
function selectRelevantFiles(
  files: Record<string, string>,
  userPrompt: string
): { primary: Record<string, string>; context: Record<string, string> } {
  // Extract keywords from user prompt
  const keywords = userPrompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);

  // Score each file
  interface ScoredFile {
    path: string;
    content: string;
    score: number;
  }

  const scoredFiles: ScoredFile[] = [];
  const alwaysInclude = ['package.json', 'frontend/src/App.tsx', 'src/App.tsx'];

  for (const [path, content] of Object.entries(files)) {
    let score = 0;
    const pathLower = path.toLowerCase();
    const contentPreview = content.substring(0, 500).toLowerCase();

    // Always include certain key files
    if (alwaysInclude.some(p => path.includes(p))) {
      score += 1000;
    }

    // Check for explicit path mentions in prompt
    if (userPrompt.toLowerCase().includes(pathLower.split('/').pop() || '')) {
      score += 500;
    }

    // Score by keyword matches in path
    for (const keyword of keywords) {
      if (pathLower.includes(keyword)) {
        score += 10;
      }
    }

    // Score by keyword matches in content preview
    for (const keyword of keywords) {
      if (contentPreview.includes(keyword)) {
        score += 5;
      }
    }

    scoredFiles.push({ path, content, score });
  }

  // Sort by score descending
  scoredFiles.sort((a, b) => b.score - a.score);

  // Select top 8 files as primary (full content)
  const primaryFiles: Record<string, string> = {};
  const primaryCount = Math.min(8, scoredFiles.length);
  for (let i = 0; i < primaryCount; i++) {
    primaryFiles[scoredFiles[i].path] = scoredFiles[i].content;
  }

  // Select next 5 files as context (truncated)
  const contextFiles: Record<string, string> = {};
  const contextCount = Math.min(5, scoredFiles.length - primaryCount);
  for (let i = primaryCount; i < primaryCount + contextCount; i++) {
    const file = scoredFiles[i];
    const lines = file.content.split('\n');
    const truncated = lines.slice(0, 50).join('\n');
    contextFiles[file.path] = truncated + (lines.length > 50 ? '\n...' : '');
  }

  return { primary: primaryFiles, context: contextFiles };
}

/**
 * Builds the full prompt with selected files and user request.
 */
function buildPromptWithFiles(
  primaryFiles: Record<string, string>,
  contextFiles: Record<string, string>,
  userPrompt: string,
  runtimeError?: RuntimeErrorInfo
): string {
  let fileContext = '=== PRIMARY FILES (relevant for modification) ===\n\n';

  for (const [path, content] of Object.entries(primaryFiles)) {
    fileContext += `--- ${path} ---\n${content}\n\n`;
  }

  if (Object.keys(contextFiles).length > 0) {
    fileContext += '\n=== CONTEXT FILES (for reference) ===\n\n';
    for (const [path, content] of Object.entries(contextFiles)) {
      fileContext += `--- ${path} (preview) ---\n${content}\n\n`;
    }
  }

  let errorContext = '';
  if (runtimeError) {
    errorContext = `\n=== RUNTIME ERROR TO FIX ===\n`;
    errorContext += `Type: ${runtimeError.type}\n`;
    errorContext += `Message: ${runtimeError.message}\n`;
    if (runtimeError.filePath) {
      errorContext += `File: ${runtimeError.filePath}:${runtimeError.line || '?'}\n`;
    }
    if (runtimeError.stack) {
      errorContext += `Stack:\n${runtimeError.stack}\n`;
    }
    errorContext += '\n';
  }

  return fileContext + errorContext + '\n' + userPrompt;
}

/**
 * Applies file operations to the project state.
 * Now computes proper line-level diffs using the diff engine.
 */
function applyFileOperations(
  files: Record<string, string>,
  operations: FileOperation[]
): { files: Record<string, string>; diffs: FileDiff[]; errors: string[] } {
  const newFiles = { ...files };
  const diffs: FileDiff[] = [];
  const errors: string[] = [];

  for (const op of operations) {
    try {
      if (op.operation === 'create') {
        if (!op.content) {
          errors.push(`Create operation for ${op.path} missing content`);
          continue;
        }
        newFiles[op.path] = op.content;

        // Compute line-level diff for created file
        const diff = computeFileDiff(op.path, undefined, op.content);
        diffs.push(diff);
      } else if (op.operation === 'delete') {
        const before = newFiles[op.path];
        delete newFiles[op.path];

        // Compute line-level diff for deleted file
        const diff = computeFileDiff(op.path, before, undefined);
        diffs.push(diff);
      } else if (op.operation === 'modify') {
        if (!op.edits || op.edits.length === 0) {
          errors.push(`Modify operation for ${op.path} has no edits`);
          continue;
        }

        const originalContent = newFiles[op.path];
        if (!originalContent) {
          errors.push(`Cannot modify ${op.path}: file does not exist`);
          continue;
        }

        let modifiedContent = originalContent;
        const editErrors: string[] = [];

        for (const edit of op.edits) {
          const result = applySearchReplace(
            modifiedContent,
            edit.search,
            edit.replace,
            edit.occurrence || 1
          );

          if (!result.success) {
            editErrors.push(`Edit failed: ${result.error}`);
            break;
          }

          modifiedContent = result.content!;
          if (result.warning) {
            console.warn(`[modify] Warning for ${op.path}:`, result.warning);
          }
        }

        if (editErrors.length > 0) {
          errors.push(`Failed to apply edits to ${op.path}: ${editErrors.join(', ')}`);
          continue;
        }

        newFiles[op.path] = modifiedContent;

        // Compute line-level diff for modified file
        const diff = computeFileDiff(op.path, originalContent, modifiedContent);
        diffs.push(diff);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      errors.push(`Error applying operation to ${op.path}: ${msg}`);
    }
  }

  return { files: newFiles, diffs, errors };
}


/**
 * Calls Gemini API to generate modification operations.
 */
async function callGeminiForModifications(
  promptText: string,
  systemInstruction: string
): Promise<{ success: boolean; operations?: FileOperation[]; error?: string }> {
  try {
    const gemini = createGeminiClient();

    const response = await gemini.generate({
      prompt: promptText,
      systemInstruction,
      temperature: 0.3,
      responseSchema: MODIFICATION_OUTPUT_SCHEMA,
    });

    if (!response.success || !response.content) {
      return { success: false, error: response.error ?? 'Failed to get AI response' };
    }

    // Parse JSON response
    let parsed: ModificationOutput;
    try {
      parsed = JSON.parse(response.content) as ModificationOutput;
    } catch (e) {
      return {
        success: false,
        error: `Failed to parse AI response: ${e instanceof Error ? e.message : 'Invalid JSON'}`
      };
    }

    // Validate structure
    if (!parsed.files || !Array.isArray(parsed.files)) {
      return { success: false, error: 'Invalid AI response: missing files array' };
    }

    return { success: true, operations: parsed.files };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, error: `Gemini API error: ${msg}` };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }

  try {
    // Extract auth header (required — verify_jwt = true ensures it's valid)
    const authHeader = req.headers.get('Authorization') ?? '';

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

    console.log('[modify] Starting modification for project:', current.id);

    // Step 1: Select relevant files using heuristic
    const { primary, context } = selectRelevantFiles(current.files, promptText);
    console.log('[modify] Selected', Object.keys(primary).length, 'primary files and', Object.keys(context).length, 'context files');

    // Step 2: Build prompt with selected files
    const systemInstruction = getModificationPrompt(promptText);
    const fullPrompt = buildPromptWithFiles(primary, context, promptText, runtimeError);

    // Step 3: Call Gemini API with selected files
    let aiResult = await callGeminiForModifications(fullPrompt, systemInstruction);

    // Step 4: Apply operations
    let applyResult = { files: current.files, diffs: [] as FileDiff[], errors: [] as string[] };

    if (aiResult.success && aiResult.operations) {
      applyResult = applyFileOperations(current.files, aiResult.operations);

      // Step 5: Fallback - if any edits failed, retry with ALL files
      if (applyResult.errors.length > 0) {
        console.warn('[modify] Some edits failed, retrying with all files as context');
        console.warn('[modify] Errors:', applyResult.errors);

        const allFilesPrompt = buildPromptWithFiles(current.files, {}, promptText, runtimeError);
        const fallbackResult = await callGeminiForModifications(allFilesPrompt, systemInstruction);

        if (fallbackResult.success && fallbackResult.operations) {
          const fallbackApply = applyFileOperations(current.files, fallbackResult.operations);

          // Use fallback result if it has fewer errors
          if (fallbackApply.errors.length < applyResult.errors.length) {
            console.log('[modify] Fallback succeeded with fewer errors');
            applyResult = fallbackApply;
          }
        }
      }
    } else {
      // If AI call failed, return error
      return new Response(
        JSON.stringify({
          success: false,
          error: aiResult.error || 'Failed to generate modifications'
        }),
        {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if we still have errors after fallback
    if (applyResult.errors.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to apply modifications: ${applyResult.errors.join('; ')}`
        }),
        {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Step 6: Build updated project state and version
    const now = new Date().toISOString();
    const versionId = crypto.randomUUID();

    const updatedProjectState: SerializedProjectState = {
      ...current,
      files: applyResult.files,
      updatedAt: now,
      currentVersionId: versionId,
    };

    const version = {
      id: versionId,
      projectId: current.id,
      prompt: promptText,
      timestamp: now,
      files: applyResult.files,
      diffs: applyResult.diffs,
      parentVersionId: current.currentVersionId,
    };

    // Step 7: Save to Supabase database using user-scoped client so RLS applies
    try {
      const supabase = createAuthClient(authHeader);

      // Resolve user_id from the JWT
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      if (userId) {
        // Update project metadata
        await supabase
          .from('projects')
          .update({
            name: updatedProjectState.name,
            description: updatedProjectState.description,
          })
          .eq('id', current.id);

        // Save new version
        const { error: verErr } = await supabase.from('versions').insert({
          id: versionId,
          project_id: current.id,
          message: promptText,
          project_state: updatedProjectState,
          diffs: applyResult.diffs,
          change_summary: null,
          user_id: userId,
        });

        if (verErr) {
          console.error('[modify] Database error:', verErr);
          throw verErr;
        }

        console.log('[modify] Saved version to database:', versionId);
      } else {
        console.warn('[modify] No user_id in JWT, skipping DB save');
      }
    } catch (dbError) {
      console.error('[modify] Failed to save to database:', dbError);
      // Don't fail the modification if DB save fails
    }

    // Step 8: Return response
    return new Response(
      JSON.stringify({
        success: true,
        projectState: updatedProjectState,
        version,
        diffs: applyResult.diffs,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (e) {
    const msg = e instanceof Error ? sanitizeError(e.message) : 'Unknown error';
    console.error('[modify] Fatal error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
