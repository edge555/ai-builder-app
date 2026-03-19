/**
 * Scoring functions for generation evaluation.
 * Evaluates generated output against reference prompt expectations.
 */

import type { ReferencePrompt } from './reference-prompts';
import type { ProjectOutput } from '../../schemas';

export interface ScoreResult {
  promptId: string;
  description: string;
  passed: boolean;
  score: number;       // 0-100
  maxScore: number;    // always 100
  checks: CheckResult[];
}

export interface CheckResult {
  name: string;
  passed: boolean;
  weight: number;
  detail?: string;
}

/**
 * Score a generated project output against a reference prompt's expectations.
 */
export function scoreOutput(
  ref: ReferencePrompt,
  output: ProjectOutput
): ScoreResult {
  const checks: CheckResult[] = [];
  const files = output.files;
  const filePaths = files.map(f => f.path);
  const allContent = files.map(f => `${f.path}\n${f.content}`).join('\n');

  // 1. File count in range (weight: 15)
  const fileCount = files.length;
  checks.push({
    name: 'file-count-range',
    passed: fileCount >= ref.minFiles && fileCount <= ref.maxFiles,
    weight: 15,
    detail: `Got ${fileCount} files, expected ${ref.minFiles}-${ref.maxFiles}`,
  });

  // 2. Required files present (weight: 20)
  const missingFiles = ref.requiredFiles.filter(
    req => !filePaths.some(p => p.includes(req))
  );
  checks.push({
    name: 'required-files',
    passed: missingFiles.length === 0,
    weight: 20,
    detail: missingFiles.length > 0
      ? `Missing: ${missingFiles.join(', ')}`
      : `All ${ref.requiredFiles.length} required files present`,
  });

  // 3. Required patterns found (weight: 20)
  const missingPatterns = ref.requiredPatterns.filter(
    pat => !allContent.toLowerCase().includes(pat.toLowerCase())
  );
  checks.push({
    name: 'required-patterns',
    passed: missingPatterns.length === 0,
    weight: 20,
    detail: missingPatterns.length > 0
      ? `Missing patterns: ${missingPatterns.join(', ')}`
      : `All ${ref.requiredPatterns.length} patterns found`,
  });

  // 4. No forbidden patterns (weight: 10)
  const foundForbidden = ref.forbiddenPatterns.filter(
    pat => allContent.toLowerCase().includes(pat.toLowerCase())
  );
  checks.push({
    name: 'no-forbidden-patterns',
    passed: foundForbidden.length === 0,
    weight: 10,
    detail: foundForbidden.length > 0
      ? `Found forbidden: ${foundForbidden.join(', ')}`
      : 'No forbidden patterns found',
  });

  // 5. Has CSS styling (weight: 10)
  const hasCss = files.some(f => f.path.endsWith('.css') && f.content.length > 50);
  checks.push({
    name: 'has-css',
    passed: hasCss,
    weight: 10,
    detail: hasCss ? 'CSS files present with content' : 'No meaningful CSS found',
  });

  // 6. No TODO/FIXME comments (weight: 10)
  const todoMatches = allContent.match(/\/\/\s*(TODO|FIXME|HACK|XXX)\b/gi) ?? [];
  checks.push({
    name: 'no-todos',
    passed: todoMatches.length === 0,
    weight: 10,
    detail: todoMatches.length > 0
      ? `Found ${todoMatches.length} TODO/FIXME comments`
      : 'No TODO/FIXME comments',
  });

  // 7. Valid JSON in package.json (weight: 10)
  const pkgFile = files.find(f => f.path === 'package.json' || f.path.endsWith('/package.json'));
  let validPkg = false;
  if (pkgFile) {
    try {
      JSON.parse(pkgFile.content);
      validPkg = true;
    } catch { /* invalid */ }
  }
  checks.push({
    name: 'valid-package-json',
    passed: validPkg,
    weight: 10,
    detail: validPkg ? 'Valid package.json' : 'Missing or invalid package.json',
  });

  // 8. No empty files (weight: 5)
  const emptyFiles = files.filter(f => f.content.trim().length === 0);
  checks.push({
    name: 'no-empty-files',
    passed: emptyFiles.length === 0,
    weight: 5,
    detail: emptyFiles.length > 0
      ? `${emptyFiles.length} empty files: ${emptyFiles.map(f => f.path).join(', ')}`
      : 'No empty files',
  });

  // Calculate weighted score
  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const earnedWeight = checks.filter(c => c.passed).reduce((sum, c) => sum + c.weight, 0);
  const score = Math.round((earnedWeight / totalWeight) * 100);

  return {
    promptId: ref.id,
    description: ref.description,
    passed: score >= 70,
    score,
    maxScore: 100,
    checks,
  };
}

/**
 * Print a human-readable eval report to console.
 */
export function printReport(results: ScoreResult[]): void {
  console.log('\n═══ Generation Eval Report ═══\n');

  for (const r of results) {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`${status}  ${r.promptId} (${r.score}/${r.maxScore}) — ${r.description}`);
    for (const c of r.checks) {
      const icon = c.passed ? '  ✓' : '  ✗';
      console.log(`${icon} ${c.name}: ${c.detail}`);
    }
    console.log('');
  }

  const passing = results.filter(r => r.passed).length;
  const avg = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
  console.log(`═══ ${passing}/${results.length} passing, avg score: ${avg}/100 ═══\n`);
}
