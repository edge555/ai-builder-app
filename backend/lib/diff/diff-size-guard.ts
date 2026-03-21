/**
 * @module diff/diff-size-guard
 * @description Evaluates how much of a file changed during a modify operation.
 * When >90% of lines changed, auto-converts to replace_file (zero token cost).
 * When >60% changed, logs a warning but continues.
 */

import { createLogger } from '../logger';

const logger = createLogger('DiffSizeGuard');

export interface DiffSizeResult {
  linesChanged: number;
  totalLines: number;
  changeRatio: number;
  verdict: 'ok' | 'suspicious' | 'converted';
  reason?: string;
}

/**
 * Evaluate how much of a file changed relative to its original content.
 *
 * - create/replace_file/delete: always 'ok' (no ratio check needed)
 * - modify with changeRatio > 0.9: 'converted' — caller should treat as replace_file
 * - modify with changeRatio > 0.6: 'suspicious' — log warning, continue
 * - modify with changeRatio <= 0.6: 'ok'
 */
export function evaluateDiffSize(
  originalContent: string,
  modifiedContent: string,
  expectedOperation: 'modify' | 'create' | 'replace_file' | 'delete'
): DiffSizeResult {
  // Non-modify operations are always fine
  if (expectedOperation !== 'modify') {
    return {
      linesChanged: 0,
      totalLines: 0,
      changeRatio: 0,
      verdict: 'ok',
    };
  }

  const originalLines = originalContent.split('\n');
  const modifiedLines = modifiedContent.split('\n');
  const totalLines = Math.max(originalLines.length, modifiedLines.length);

  if (totalLines === 0) {
    return { linesChanged: 0, totalLines: 0, changeRatio: 0, verdict: 'ok' };
  }

  // Count lines that differ (simple line-by-line comparison)
  let changedCount = 0;
  const maxLen = Math.max(originalLines.length, modifiedLines.length);
  for (let i = 0; i < maxLen; i++) {
    const orig = i < originalLines.length ? originalLines[i] : undefined;
    const mod = i < modifiedLines.length ? modifiedLines[i] : undefined;
    if (orig !== mod) {
      changedCount++;
    }
  }

  const changeRatio = changedCount / totalLines;

  if (changeRatio > 0.9) {
    logger.warn('Modify operation changed >90% of file — auto-converting to replace_file', {
      changeRatio: changeRatio.toFixed(2),
      linesChanged: changedCount,
      totalLines,
    });
    return {
      linesChanged: changedCount,
      totalLines,
      changeRatio,
      verdict: 'converted',
      reason: `${(changeRatio * 100).toFixed(0)}% of lines changed — auto-converted to replace_file`,
    };
  }

  if (changeRatio > 0.6) {
    logger.warn('Modify operation changed >60% of file — suspicious but continuing', {
      changeRatio: changeRatio.toFixed(2),
      linesChanged: changedCount,
      totalLines,
    });
    return {
      linesChanged: changedCount,
      totalLines,
      changeRatio,
      verdict: 'suspicious',
      reason: `${(changeRatio * 100).toFixed(0)}% of lines changed`,
    };
  }

  return {
    linesChanged: changedCount,
    totalLines,
    changeRatio,
    verdict: 'ok',
  };
}
