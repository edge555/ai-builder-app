/**
 * @module diff/root-cause-analyzer
 * @description Hybrid root cause analysis for build errors.
 *
 * Flow:
 *   error in file B
 *     |
 *     +-- trace import chain backward through file contents
 *     |     +-- exactly 1 modified ancestor -> deterministic root cause
 *     |     +-- multiple modified ancestors -> AI call to disambiguate
 *     |     +-- no modified ancestors -> AI call (truly unknown)
 *     |
 *     +-- result: { rootFile, rootCause, approach }
 */

import type { AIProvider } from '../ai';
import type { BuildError } from '../core/build-validator';
import { createLogger } from '../logger';

const logger = createLogger('RootCauseAnalyzer');

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RootCauseResult {
  rootFile: string;
  rootCause: string;
  approach: 'deterministic' | 'ai-analyzed' | 'unknown';
}

// ─── Import Graph ───────────────────────────────────────────────────────────

const IMPORT_REGEX = /^\s*import\s+(?:[\w\s{},*]+\s+from\s+)?['"](\.[^'"]+)['"]/gm;
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * Build a lightweight import graph from file contents.
 * Returns a map of filePath -> Set of files it imports (resolved).
 */
export function buildImportGraph(
  allFiles: Record<string, string>,
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const fileSet = new Set(Object.keys(allFiles));

  for (const [filePath, content] of Object.entries(allFiles)) {
    const imports = new Set<string>();
    IMPORT_REGEX.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = IMPORT_REGEX.exec(content)) !== null) {
      const resolved = resolveImport(filePath, match[1], fileSet);
      if (resolved) {
        imports.add(resolved);
      }
    }

    graph.set(filePath, imports);
  }

  return graph;
}

/**
 * Resolve a relative import to a file path.
 */
function resolveImport(
  fromFile: string,
  importSource: string,
  fileSet: Set<string>,
): string | null {
  const fromDir = fromFile.replace(/\/[^/]+$/, '') || '.';
  let resolved = normalizePath(`${fromDir}/${importSource}`);

  // Direct match
  if (fileSet.has(resolved)) return resolved;

  // Try extensions
  for (const ext of EXTENSIONS) {
    const candidate = resolved + ext;
    if (fileSet.has(candidate)) return candidate;
  }

  // Try index files
  for (const ext of EXTENSIONS) {
    const candidate = resolved + '/index' + ext;
    if (fileSet.has(candidate)) return candidate;
  }

  return null;
}

/**
 * Normalize a path (resolve . and ..).
 */
function normalizePath(p: string): string {
  const parts = p.split('/');
  const result: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      result.pop();
    } else {
      result.push(part);
    }
  }
  return result.join('/');
}

// ─── Ancestor Tracing ───────────────────────────────────────────────────────

/**
 * Find all ancestors (transitive imports) of a file that are in the modified set.
 * Uses BFS with cycle guard.
 */
export function findModifiedAncestors(
  errorFile: string,
  modifiedFiles: Set<string>,
  importGraph: Map<string, Set<string>>,
): string[] {
  const visited = new Set<string>();
  const queue = [errorFile];
  const modifiedAncestors: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const imports = importGraph.get(current);
    if (!imports) continue;

    for (const dep of imports) {
      if (modifiedFiles.has(dep) && dep !== errorFile) {
        modifiedAncestors.push(dep);
      }
      if (!visited.has(dep)) {
        queue.push(dep);
      }
    }
  }

  return [...new Set(modifiedAncestors)];
}

// ─── Root Cause Analyzer ────────────────────────────────────────────────────

/**
 * Analyze the root cause of a build error.
 *
 * - If exactly 1 modified ancestor in the import chain: deterministic
 * - If 0 or multiple: AI call to disambiguate (or unknown if no AI)
 */
export async function analyzeRootCause(
  error: BuildError,
  modifiedFiles: Set<string>,
  allFiles: Record<string, string>,
  importGraph: Map<string, Set<string>>,
  aiProvider?: AIProvider,
): Promise<RootCauseResult> {
  const ancestors = findModifiedAncestors(error.file, modifiedFiles, importGraph);

  // Exactly 1 modified ancestor -> deterministic
  if (ancestors.length === 1) {
    logger.debug('Root cause: deterministic', {
      errorFile: error.file,
      rootFile: ancestors[0],
    });
    return {
      rootFile: ancestors[0],
      rootCause: `Error in ${error.file} likely caused by changes in ${ancestors[0]}`,
      approach: 'deterministic',
    };
  }

  // No AI provider -> unknown
  if (!aiProvider) {
    return {
      rootFile: error.file,
      rootCause: error.message,
      approach: 'unknown',
    };
  }

  // 0 or multiple ancestors -> AI call
  return analyzeWithAI(error, ancestors, allFiles, aiProvider);
}

/**
 * Use AI to disambiguate root cause when dep graph is ambiguous.
 */
async function analyzeWithAI(
  error: BuildError,
  ancestors: string[],
  allFiles: Record<string, string>,
  aiProvider: AIProvider,
): Promise<RootCauseResult> {
  const ancestorContext = ancestors.length > 0
    ? `Modified files in import chain: ${ancestors.join(', ')}`
    : 'No modified files found in import chain';

  const prompt = [
    'Analyze this build error and identify the root cause file.',
    '',
    `Error file: ${error.file}`,
    `Error: ${error.message}`,
    ancestorContext,
    '',
    'Respond with JSON only:',
    '{"rootFile": "path/to/root-cause-file", "rootCause": "one sentence explanation"}',
  ].join('\n');

  try {
    const response = await aiProvider.generate({
      prompt,
      systemInstruction: 'You are a build error analyzer. Respond with valid JSON only.',
      temperature: 0.0,
      maxOutputTokens: 512,
    });

    if (!response.success || !response.content) {
      logger.warn('Root cause AI call failed', { error: response.error });
      return {
        rootFile: error.file,
        rootCause: error.message,
        approach: 'unknown',
      };
    }

    const parsed = JSON.parse(response.content);
    if (typeof parsed.rootFile === 'string' && typeof parsed.rootCause === 'string') {
      logger.debug('Root cause: AI analyzed', {
        errorFile: error.file,
        rootFile: parsed.rootFile,
      });
      return {
        rootFile: parsed.rootFile,
        rootCause: parsed.rootCause,
        approach: 'ai-analyzed',
      };
    }

    throw new Error('Invalid AI response shape');
  } catch (err) {
    logger.warn('Root cause analysis failed, proceeding as unknown', {
      errorFile: error.file,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      rootFile: error.file,
      rootCause: error.message,
      approach: 'unknown',
    };
  }
}
