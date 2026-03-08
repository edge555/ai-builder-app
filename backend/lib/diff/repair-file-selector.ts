/**
 * Repair File Selector
 *
 * Selects only relevant files for auto-repair instead of sending
 * the entire project to the AI. Uses error-affected file paths
 * and their dependents/dependencies to build a focused context.
 */

import type { ProjectState } from '@ai-app-builder/shared';
import type { CodeSlice } from '../analysis/file-planner/types';
import { createLogger } from '../logger';

const logger = createLogger('RepairFileSelector');

/** Maximum files to include in repair context */
const MAX_REPAIR_FILES = 12;

export interface ErrorContext {
  affectedFiles: string[];
  errorType: string;
}

/**
 * Select relevant files for a repair operation based on error context.
 * Includes affected files as primary, their dependents as context,
 * and always includes package.json.
 *
 * Falls back to all files if no affected files match the project.
 */
export function selectRepairFiles(
  projectState: ProjectState,
  errorContext: ErrorContext
): CodeSlice[] {
  const { files } = projectState;
  const { affectedFiles, errorType } = errorContext;

  // Normalize affected file paths (remove leading ./ or /)
  const normalizedAffected = affectedFiles
    .map(f => f.replace(/^\.?\//, ''))
    .filter(f => f in files);

  if (normalizedAffected.length === 0) {
    logger.info('No affected files matched project, falling back to all files', {
      provided: affectedFiles,
      errorType,
    });
    return buildAllSlices(files);
  }

  const primarySet = new Set(normalizedAffected);
  const contextSet = new Set<string>();

  // Always include package.json for dependency-related fixes
  if (files['package.json'] && !primarySet.has('package.json')) {
    if (errorType === 'IMPORT_ERROR' || errorType === 'BUILD_ERROR') {
      primarySet.add('package.json');
    } else {
      contextSet.add('package.json');
    }
  }

  // Find dependents (files that import affected files) using simple import scanning
  for (const [filePath, content] of Object.entries(files)) {
    if (primarySet.has(filePath) || contextSet.has(filePath)) continue;
    if (!isSourceFile(filePath)) continue;

    for (const affected of normalizedAffected) {
      if (importsFile(content, filePath, affected)) {
        contextSet.add(filePath);
        break;
      }
    }
  }

  // Find dependencies (files that affected files import)
  for (const affected of normalizedAffected) {
    const content = files[affected];
    if (!content || !isSourceFile(affected)) continue;

    for (const [filePath] of Object.entries(files)) {
      if (primarySet.has(filePath) || contextSet.has(filePath)) continue;
      if (importsFile(content, affected, filePath)) {
        contextSet.add(filePath);
      }
    }
  }

  // Build slices, respecting the cap
  const slices: CodeSlice[] = [];

  for (const filePath of primarySet) {
    if (slices.length >= MAX_REPAIR_FILES) break;
    slices.push({ filePath, content: files[filePath], relevance: 'primary' });
  }

  for (const filePath of contextSet) {
    if (slices.length >= MAX_REPAIR_FILES) break;
    slices.push({ filePath, content: files[filePath], relevance: 'context' });
  }

  logger.info('Selected repair files', {
    errorType,
    primary: primarySet.size,
    context: contextSet.size,
    total: slices.length,
    affectedFiles: normalizedAffected,
  });

  return slices;
}

const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];

function isSourceFile(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  return SOURCE_EXTS.includes(ext);
}

const IMPORT_RE = /(?:import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;

/**
 * Check if `sourceContent` (at `sourcePath`) imports `targetPath`.
 */
function importsFile(sourceContent: string, sourcePath: string, targetPath: string): boolean {
  const sourceDir = sourcePath.substring(0, sourcePath.lastIndexOf('/')) || '.';
  const targetNoExt = targetPath.replace(/\.(ts|tsx|js|jsx)$/, '');

  IMPORT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMPORT_RE.exec(sourceContent)) !== null) {
    const mod = match[1] || match[2];
    if (!mod || (!mod.startsWith('./') && !mod.startsWith('../'))) continue;

    const resolved = resolveRelative(sourceDir, mod);
    if (resolved === targetPath || resolved === targetNoExt) return true;
    // Check with extensions
    for (const ext of SOURCE_EXTS) {
      if (resolved + ext === targetPath) return true;
    }
    // Check index files
    if (resolved + '/index.ts' === targetPath || resolved + '/index.tsx' === targetPath) return true;
  }
  return false;
}

function resolveRelative(dir: string, importPath: string): string {
  if (importPath.startsWith('./')) {
    return `${dir}/${importPath.slice(2)}`;
  }
  const parts = dir.split('/');
  let remaining = importPath;
  while (remaining.startsWith('../')) {
    parts.pop();
    remaining = remaining.slice(3);
  }
  return `${parts.join('/')}/${remaining}`;
}

function buildAllSlices(files: Record<string, string>): CodeSlice[] {
  return Object.entries(files).map(([filePath, content]) => ({
    filePath,
    content,
    relevance: 'primary' as const,
  }));
}
