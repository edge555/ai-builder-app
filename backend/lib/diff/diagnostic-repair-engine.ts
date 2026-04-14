/**
 * @module diff/diagnostic-repair-engine
 * @description Structured repair engine that replaces the build-fixer retry loop.
 *
 * Escalation ladder (each level handles ALL errors at once, not per-file):
 *   1. Deterministic fixes — 0 AI calls
 *   2. Targeted AI — ONE call, broken files + errors only, temp 0.2
 *   3. Broad AI — ONE call, broken files + related files + history, temp 0.4
 *   4. Rollback — revert still-broken files to checkpoint, partial success
 *
 * Token cost: worst case 3 broken files → 0-2 AI calls (vs 3-12 in old system)
 */

import type { ProjectState, RepairAttempt } from '@ai-app-builder/shared';
import type { AIProvider } from '../ai';
import type { BuildValidator, BuildError, BuildValidationResult } from '../core/build-validator';
import type { AcceptanceGate } from '../core/acceptance-gate';
import { tryDeterministicFixes } from './deterministic-fixes';
import { getModificationPrompt, MODIFICATION_OUTPUT_SCHEMA } from './prompts/modification-prompt';
import { buildFixPrompt } from '../core/prompts/build-fix-prompt';
import { buildBuildFixPrompt } from './prompt-builder';
import { ModificationOutputSchema } from '../core/schemas';
import { applyEdits } from './edit-applicator';
import { getMaxOutputTokens } from '../config';
import { createLogger } from '../logger';
import { getStructuredParseError, parseStructuredOutput } from '../ai/structured-output';

const logger = createLogger('DiagnosticRepairEngine');

// ─── Error Taxonomy ────────────────────────────────────────────────────────

export type RepairCategory =
  | 'MISSING_DEPENDENCY'
  | 'BROKEN_IMPORT'
  | 'EXPORT_MISMATCH'
  | 'SYNTAX_ERROR'
  | 'RUNTIME'
  | 'UNKNOWN';

/**
 * Map a BuildError.type to a RepairCategory.
 */
export function classifyError(error: BuildError): RepairCategory {
  switch (error.type) {
    case 'missing_dependency':
      return 'MISSING_DEPENDENCY';
    case 'broken_import':
    case 'missing_file':
      return 'BROKEN_IMPORT';
    case 'import_export_mismatch':
      return 'EXPORT_MISMATCH';
    case 'syntax_error':
      return 'SYNTAX_ERROR';
    case 'directive_error':
    case 'server_client_boundary':
    case 'prisma_error':
    case 'naming_convention':
      return 'UNKNOWN';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Whether a category has a deterministic fix strategy.
 */
export function hasDeterministicFix(category: RepairCategory): boolean {
  return category === 'MISSING_DEPENDENCY'
    || category === 'BROKEN_IMPORT'
    || category === 'EXPORT_MISMATCH'
    || category === 'SYNTAX_ERROR';
}

// ─── Repair Engine ─────────────────────────────────────────────────────────

export interface RepairRequest {
  projectState: ProjectState;
  updatedFiles: Record<string, string | null>;
  prompt: string;
  shouldIncludeDesignSystem: boolean;
  aiProvider: AIProvider;
  buildValidator: BuildValidator;
  acceptanceGate: AcceptanceGate;
  /** Pre-modification file contents for rollback */
  checkpoint?: Record<string, string>;
  requestId?: string;
}

export type RepairLevel = 'deterministic' | 'targeted-ai' | 'broad-ai' | 'rollback';

export interface RepairResult {
  updatedFiles: Record<string, string | null>;
  success: boolean;
  partialSuccess: boolean;
  rolledBackFiles: string[];
  repairLevel: RepairLevel;
  totalAICalls: number;
}

/**
 * Diagnostic repair engine. Batches ALL errors into single AI calls per level.
 *
 * Flow:
 *   Step 1: Classify all errors
 *   Step 2: Deterministic fixes (0 AI calls) → re-validate
 *   Step 3: Targeted AI (1 call, temp 0.2) → re-validate
 *   Step 4: Broad AI (1 call, temp 0.4, + related files) → re-validate
 *   Step 5: Rollback still-broken files → partial success
 */
export class DiagnosticRepairEngine {
  async repair(request: RepairRequest): Promise<RepairResult> {
    const {
      projectState, updatedFiles, prompt, shouldIncludeDesignSystem,
      aiProvider, buildValidator, acceptanceGate, checkpoint, requestId,
    } = request;

    const mutableFiles = { ...updatedFiles };
    const tempFiles = buildMergedView(projectState, mutableFiles);
    let totalAICalls = 0;
    const failureHistory: RepairAttempt[] = [];

    // Initial validation
    let acceptanceResult = acceptanceGate.validate(tempFiles, {
      changedFiles: Object.keys(mutableFiles),
    });
    let buildResult: BuildValidationResult = {
      valid: acceptanceResult.buildErrors.length === 0,
      errors: acceptanceResult.buildErrors,
    };
    if (acceptanceResult.valid) {
      return {
        updatedFiles: mutableFiles,
        success: true,
        partialSuccess: false,
        rolledBackFiles: [],
        repairLevel: 'deterministic',
        totalAICalls: 0,
      };
    }

    // ── Step 1: Classify all errors ──────────────────────────────────────
    const classified = buildResult.errors.map(e => ({
      error: e,
      category: classifyError(e),
    }));

    logger.info('Repair engine: classified errors', {
      total: classified.length,
      categories: Object.fromEntries(
        [...new Set(classified.map(c => c.category))].map(cat => [
          cat,
          classified.filter(c => c.category === cat).length,
        ])
      ),
    });

    // ── Step 2: Deterministic fixes (0 AI calls) ─────────────────────────
    const fixableErrors = buildResult.errors.filter(e => e.severity === 'fixable');
    if (fixableErrors.length > 0) {
      const { fixed, fileChanges } = tryDeterministicFixes(fixableErrors, tempFiles);
      if (fixed.length > 0) {
        applyChanges(fileChanges, mutableFiles, tempFiles);
        acceptanceResult = acceptanceGate.validate(tempFiles, {
          changedFiles: Object.keys(mutableFiles),
        });
        buildResult = {
          valid: acceptanceResult.buildErrors.length === 0,
          errors: acceptanceResult.buildErrors,
        };

        logger.info('Repair engine: deterministic fixes applied', {
          fixedCount: fixed.length,
          remainingIssues: acceptanceResult.issues.length,
        });

        if (acceptanceResult.valid) {
          return {
            updatedFiles: mutableFiles,
            success: true,
            partialSuccess: false,
            rolledBackFiles: [],
            repairLevel: 'deterministic',
            totalAICalls: 0,
          };
        }
      }
    }

    // ── Step 3: Targeted AI call (temp 0.2) ──────────────────────────────
    const targetedResult = await this.aiRepairCall(
      buildResult, mutableFiles, tempFiles, prompt,
      shouldIncludeDesignSystem, aiProvider, buildValidator,
      failureHistory, 0.2, false, requestId,
    );
    totalAICalls++;

    if (targetedResult.applied) {
      acceptanceResult = acceptanceGate.validate(tempFiles, {
        changedFiles: Object.keys(mutableFiles),
      });
      buildResult = {
        valid: acceptanceResult.buildErrors.length === 0,
        errors: acceptanceResult.buildErrors,
      };
      if (acceptanceResult.valid) {
        return {
          updatedFiles: mutableFiles,
          success: true,
          partialSuccess: false,
          rolledBackFiles: [],
          repairLevel: 'targeted-ai',
          totalAICalls,
        };
      }

      failureHistory.push({
        attempt: 1,
        error: acceptanceResult.issues.map(e => e.message).join('; '),
        strategy: 'Targeted AI repair (temp 0.2, broken files only)',
        timestamp: new Date().toISOString(),
      });
    }

    // ── Step 4: Broad AI call (temp 0.4, + related files) ────────────────
    const broadResult = await this.aiRepairCall(
      buildResult, mutableFiles, tempFiles, prompt,
      shouldIncludeDesignSystem, aiProvider, buildValidator,
      failureHistory, 0.4, true, requestId,
    );
    totalAICalls++;

    if (broadResult.applied) {
      acceptanceResult = acceptanceGate.validate(tempFiles, {
        changedFiles: Object.keys(mutableFiles),
      });
      buildResult = {
        valid: acceptanceResult.buildErrors.length === 0,
        errors: acceptanceResult.buildErrors,
      };
      if (acceptanceResult.valid) {
        return {
          updatedFiles: mutableFiles,
          success: true,
          partialSuccess: false,
          rolledBackFiles: [],
          repairLevel: 'broad-ai',
          totalAICalls,
        };
      }
    }

    // ── Step 5: Rollback still-broken files ──────────────────────────────
    const rolledBackFiles: string[] = [];

    if (checkpoint) {
      const brokenFiles = new Set(
        acceptanceResult.issues
          .map((issue) => issue.file)
          .filter((file): file is string => typeof file === 'string')
      );
      for (const brokenFile of brokenFiles) {
        if (checkpoint[brokenFile] !== undefined) {
          mutableFiles[brokenFile] = checkpoint[brokenFile];
          tempFiles[brokenFile] = checkpoint[brokenFile];
          rolledBackFiles.push(brokenFile);
        }
      }
    }

    const hasPartialSuccess = rolledBackFiles.length > 0
      && Object.keys(mutableFiles).some(f => !rolledBackFiles.includes(f));

    logger.warn('Repair engine: exhausted all levels', {
      totalAICalls,
      rolledBackFiles,
      remainingIssues: acceptanceResult.issues.length,
      partialSuccess: hasPartialSuccess,
    });

    return {
      updatedFiles: mutableFiles,
      success: false,
      partialSuccess: hasPartialSuccess,
      rolledBackFiles,
      repairLevel: 'rollback',
      totalAICalls,
    };
  }

  /**
   * Make a single batched AI repair call for ALL remaining errors.
   */
  private async aiRepairCall(
    buildResult: BuildValidationResult,
    mutableFiles: Record<string, string | null>,
    tempFiles: Record<string, string>,
    prompt: string,
    shouldIncludeDesignSystem: boolean,
    aiProvider: AIProvider,
    buildValidator: BuildValidator,
    failureHistory: RepairAttempt[],
    temperature: number,
    includeRelatedFiles: boolean,
    requestId?: string,
  ): Promise<{ applied: boolean }> {
    const errorContext = buildValidator.formatErrorsForAI(buildResult.errors);
    const fixUserRequest = buildFixPrompt({
      mode: 'modification',
      errorContext,
      originalPrompt: prompt,
      failureHistory: failureHistory.length > 0 ? failureHistory : undefined,
    });

    const systemInstruction = getModificationPrompt(fixUserRequest, shouldIncludeDesignSystem)
      + '\n\nIMPORTANT: Fix ALL build errors. Adding missing dependencies to package.json is usually the solution.';

    // Build context: broken files (+ optionally related files)
    const errorFiles = new Set(buildResult.errors.map(e => e.file));
    let contextFiles = tempFiles;

    if (includeRelatedFiles) {
      // Include up to 3 related files per error file (files that import or are imported by error files)
      const relatedFiles = findRelatedFiles(errorFiles, tempFiles, 3);
      contextFiles = { ...tempFiles };
      // relatedFiles are already in tempFiles, just ensure errorFiles + related are included
      for (const rf of relatedFiles) {
        errorFiles.add(rf);
      }
    }

    const fixContextPrompt = buildBuildFixPrompt(fixUserRequest, errorFiles, contextFiles);

    logger.info('Repair engine: AI call', {
      temperature,
      includeRelatedFiles,
      errorCount: buildResult.errors.length,
      errorFileCount: errorFiles.size,
    });

    const response = await aiProvider.generate({
      prompt: fixContextPrompt,
      systemInstruction,
      temperature,
      maxOutputTokens: getMaxOutputTokens('modification'),
      responseSchema: MODIFICATION_OUTPUT_SCHEMA,
      requestId,
    });

    if (!response.success || !response.content) {
      logger.error('Repair engine: AI call failed', {
        error: response.error,
        temperature,
      });
      return { applied: false };
    }

    // Parse and apply
    return this.parseAndApply(response.content, mutableFiles, tempFiles);
  }

  /**
   * Parse AI response and apply edits to mutable files.
   */
  private parseAndApply(
    content: string,
    mutableFiles: Record<string, string | null>,
    tempFiles: Record<string, string>,
  ): { applied: boolean } {
    const parsedResult = parseStructuredOutput(content, ModificationOutputSchema, 'ModificationOutput');
    if (!parsedResult.success) {
      const parseError = getStructuredParseError(parsedResult);
      logger.error('Repair engine: AI response failed structured parsing', {
        error: parseError,
      });
      return { applied: false };
    }

    const output = parsedResult.data;
    if (!output.files || !Array.isArray(output.files)) {
      return { applied: false };
    }

    let anyApplied = false;
    for (const fileEdit of output.files) {
      if (fileEdit.operation === 'modify' && 'edits' in fileEdit && fileEdit.edits) {
        const currentContent = tempFiles[fileEdit.path];
        if (!currentContent) continue;
        const editResult = applyEdits(currentContent, fileEdit.edits);
        if (editResult.success) {
          mutableFiles[fileEdit.path] = editResult.content!;
          tempFiles[fileEdit.path] = editResult.content!;
          anyApplied = true;
        }
      } else if (
        (fileEdit.operation === 'create' || fileEdit.operation === 'replace_file')
        && 'content' in fileEdit
        && fileEdit.content
      ) {
        mutableFiles[fileEdit.path] = fileEdit.content;
        tempFiles[fileEdit.path] = fileEdit.content;
        anyApplied = true;
      }
    }

    return { applied: anyApplied };
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Merge projectState.files with updatedFiles (null = delete).
 */
function buildMergedView(
  projectState: ProjectState,
  updatedFiles: Record<string, string | null>
): Record<string, string> {
  const merged = { ...projectState.files };
  for (const [path, content] of Object.entries(updatedFiles)) {
    if (content === null) {
      delete merged[path];
    } else {
      merged[path] = content;
    }
  }
  return merged;
}

/**
 * Apply file changes to both mutable file records.
 */
function applyChanges(
  changes: Record<string, string>,
  mutableFiles: Record<string, string | null>,
  tempFiles: Record<string, string>,
): void {
  for (const [path, content] of Object.entries(changes)) {
    mutableFiles[path] = content;
    tempFiles[path] = content;
  }
}

/**
 * Find files related to error files (import or imported-by relationships).
 * Returns up to `maxPerFile` related files per error file.
 */
function findRelatedFiles(
  errorFiles: Set<string>,
  allFiles: Record<string, string>,
  maxPerFile: number,
): Set<string> {
  const related = new Set<string>();
  const importRegex = /^\s*import\s+(?:[\w\s{},*]+\s+from\s+)?['"](\.[^'"]+)['"]/gm;

  for (const errorFile of errorFiles) {
    let count = 0;

    // Files that the error file imports
    const content = allFiles[errorFile];
    if (content) {
      let match: RegExpExecArray | null;
      importRegex.lastIndex = 0;
      while ((match = importRegex.exec(content)) !== null && count < maxPerFile) {
        const importPath = match[1];
        // Find matching file
        for (const filePath of Object.keys(allFiles)) {
          const normalized = filePath.replace(/\\/g, '/').toLowerCase();
          if (normalized.includes(importPath.replace('./', '').replace('../', '').toLowerCase())) {
            if (!errorFiles.has(filePath)) {
              related.add(filePath);
              count++;
            }
            break;
          }
        }
      }
    }

    // Files that import the error file
    if (count < maxPerFile) {
      const errorBaseName = errorFile.replace(/\.[^.]+$/, '').split('/').pop()?.toLowerCase();
      if (errorBaseName) {
        for (const [filePath, fileContent] of Object.entries(allFiles)) {
          if (errorFiles.has(filePath) || related.has(filePath)) continue;
          if (count >= maxPerFile) break;

          if (fileContent.toLowerCase().includes(errorBaseName)) {
            related.add(filePath);
            count++;
          }
        }
      }
    }
  }

  return related;
}

export function createDiagnosticRepairEngine(): DiagnosticRepairEngine {
  return new DiagnosticRepairEngine();
}
