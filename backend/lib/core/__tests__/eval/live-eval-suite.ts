import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ProjectState } from '@ai-app-builder/shared';
import { createGenerationPipeline } from '../../pipeline-factory';
import { createModificationEngine } from '../../../diff/modification-engine';
import type { ProjectOutput } from '../../schemas';
import { runGenerationEvalCase, runModificationEvalCase, type GenerationEvalResult, type ModificationEvalResult } from './eval-harness';
import type { GenerationEvalCase } from './eval-cases';

export interface LiveModificationEvalSpec {
  id: string;
  seedPrompt: string;
  prompt: string;
  requiredChangedFiles: string[];
  requiredPatterns?: string[];
  unchangedFiles?: string[];
}

export interface LiveEvalSuiteOptions {
  generationCases?: Array<Omit<GenerationEvalCase, 'output'>>;
  modificationCases?: LiveModificationEvalSpec[];
  reportPath?: string;
}

export interface LiveGenerationCaseResult {
  caseId: string;
  passed: boolean;
  durationMs: number;
  generatedFileCount: number;
  complexityRoute: 'one-shot' | 'multi-phase' | null;
  evaluation?: GenerationEvalResult;
  error?: string;
}

export interface LiveModificationCaseResult {
  caseId: string;
  passed: boolean;
  durationMs: number;
  beforeFileCount?: number;
  afterFileCount?: number;
  evaluation?: ModificationEvalResult;
  error?: string;
}

export interface LiveEvalSuiteReport {
  startedAt: string;
  finishedAt: string;
  generation: LiveGenerationCaseResult[];
  modification: LiveModificationCaseResult[];
  summary: {
    generationPassed: number;
    generationTotal: number;
    modificationPassed: number;
    modificationTotal: number;
    totalPassed: number;
    totalCases: number;
  };
}

export const DEFAULT_LIVE_GENERATION_CASES: Array<Omit<GenerationEvalCase, 'output'>> = [
  {
    id: 'live-beginner-counter',
    prompt: 'Build a simple counter app with increment and decrement buttons.',
    referencePromptId: 'simple-counter',
    requiredPatterns: ['increment', 'decrement'],
    forbiddenPatterns: ['TODO', 'FIXME'],
  },
  {
    id: 'live-beginner-landing',
    prompt: 'Create a beginner-friendly landing page for a habit tracker app with clear CTA buttons.',
    requiredPatterns: ['button'],
    forbiddenPatterns: ['TODO', 'FIXME'],
  },
];

export const DEFAULT_LIVE_MODIFICATION_CASES: LiveModificationEvalSpec[] = [
  {
    id: 'live-mod-counter-reset',
    seedPrompt: 'Build a simple counter app with increment and decrement buttons.',
    prompt: 'Add a Reset button to the counter and keep existing increment/decrement behavior.',
    requiredChangedFiles: ['src/App.tsx'],
    requiredPatterns: ['Reset'],
    unchangedFiles: ['src/main.tsx'],
  },
];

function generatedFilesToOutput(files: Array<{ path: string; content: string }>): ProjectOutput {
  return {
    files: files.map((file) => ({
      path: file.path,
      content: file.content,
    })),
  };
}

function outputToRecord(output: ProjectOutput): Record<string, string> {
  return Object.fromEntries(output.files.map((file) => [file.path, file.content]));
}

function buildProjectStateFromOutput(output: ProjectOutput, description: string, idSeed: string): ProjectState {
  const now = new Date();
  return {
    id: `live-eval-${idSeed}`,
    name: `Live Eval ${idSeed}`,
    description,
    files: outputToRecord(output),
    createdAt: now,
    updatedAt: now,
    currentVersionId: `v-${idSeed}-0`,
  };
}

function printLiveSuiteReport(report: LiveEvalSuiteReport): void {
  console.log('\n=== Live Eval Suite Report ===');
  console.log(`Started:  ${report.startedAt}`);
  console.log(`Finished: ${report.finishedAt}`);
  console.log(`Generation:   ${report.summary.generationPassed}/${report.summary.generationTotal} passed`);
  console.log(`Modification: ${report.summary.modificationPassed}/${report.summary.modificationTotal} passed`);
  console.log(`Total:        ${report.summary.totalPassed}/${report.summary.totalCases} passed\n`);

  for (const generationCase of report.generation) {
    console.log(
      `[GEN] ${generationCase.passed ? 'PASS' : 'FAIL'} ${generationCase.caseId} ` +
      `(${generationCase.generatedFileCount} files, ${generationCase.durationMs}ms, route=${generationCase.complexityRoute ?? 'n/a'})`,
    );
    if (generationCase.error) {
      console.log(`  error: ${generationCase.error}`);
    } else if (generationCase.evaluation && generationCase.evaluation.issues.length > 0) {
      console.log(`  issues: ${generationCase.evaluation.issues.join(' | ')}`);
    }
  }

  for (const modificationCase of report.modification) {
    console.log(
      `[MOD] ${modificationCase.passed ? 'PASS' : 'FAIL'} ${modificationCase.caseId} ` +
      `(${modificationCase.durationMs}ms, files ${modificationCase.beforeFileCount ?? 0} -> ${modificationCase.afterFileCount ?? 0})`,
    );
    if (modificationCase.error) {
      console.log(`  error: ${modificationCase.error}`);
    } else if (modificationCase.evaluation && modificationCase.evaluation.issues.length > 0) {
      console.log(`  issues: ${modificationCase.evaluation.issues.join(' | ')}`);
    }
  }

  console.log('');
}

export async function runLiveEvalSuite(options: LiveEvalSuiteOptions = {}): Promise<LiveEvalSuiteReport> {
  const generationCases = options.generationCases ?? DEFAULT_LIVE_GENERATION_CASES;
  const modificationCases = options.modificationCases ?? DEFAULT_LIVE_MODIFICATION_CASES;
  const reportPath = options.reportPath
    ? resolve(options.reportPath)
    : resolve(process.cwd(), 'data', 'live-eval-report.json');

  const startedAt = new Date();
  const generationPipeline = await createGenerationPipeline();
  const modificationEngine = await createModificationEngine();

  const generationResults: LiveGenerationCaseResult[] = [];
  for (const evalCase of generationCases) {
    const started = Date.now();
    try {
      const generationResult = await generationPipeline.runGeneration(evalCase.prompt, {}, {
        requestId: `live-eval-gen-${evalCase.id}`,
      });
      const output = generatedFilesToOutput(generationResult.generatedFiles);
      const evaluation = runGenerationEvalCase({
        ...evalCase,
        output,
      });

      generationResults.push({
        caseId: evalCase.id,
        passed: evaluation.passed,
        durationMs: Date.now() - started,
        generatedFileCount: output.files.length,
        complexityRoute: generationResult.complexityRoute,
        evaluation,
      });
    } catch (error) {
      generationResults.push({
        caseId: evalCase.id,
        passed: false,
        durationMs: Date.now() - started,
        generatedFileCount: 0,
        complexityRoute: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const modificationResults: LiveModificationCaseResult[] = [];
  for (const evalCase of modificationCases) {
    const started = Date.now();
    try {
      const seedResult = await generationPipeline.runGeneration(evalCase.seedPrompt, {}, {
        requestId: `live-eval-seed-${evalCase.id}`,
      });
      const seedOutput = generatedFilesToOutput(seedResult.generatedFiles);
      const beforeFiles = outputToRecord(seedOutput);
      const baseProjectState = buildProjectStateFromOutput(seedOutput, evalCase.seedPrompt, evalCase.id);

      const modificationResult = await modificationEngine.modifyProject(baseProjectState, evalCase.prompt, {
        requestId: `live-eval-mod-${evalCase.id}`,
      });

      if (!modificationResult.success || !modificationResult.projectState) {
        modificationResults.push({
          caseId: evalCase.id,
          passed: false,
          durationMs: Date.now() - started,
          beforeFileCount: Object.keys(beforeFiles).length,
          afterFileCount: Object.keys(beforeFiles).length,
          error: modificationResult.error ?? 'Modification returned unsuccessful result',
        });
        continue;
      }

      const afterFiles = modificationResult.projectState.files;
      const evaluation = runModificationEvalCase({
        id: evalCase.id,
        prompt: evalCase.prompt,
        beforeFiles,
        afterFiles,
        requiredChangedFiles: evalCase.requiredChangedFiles,
        requiredPatterns: evalCase.requiredPatterns,
        unchangedFiles: evalCase.unchangedFiles,
      });

      modificationResults.push({
        caseId: evalCase.id,
        passed: evaluation.passed,
        durationMs: Date.now() - started,
        beforeFileCount: Object.keys(beforeFiles).length,
        afterFileCount: Object.keys(afterFiles).length,
        evaluation,
      });
    } catch (error) {
      modificationResults.push({
        caseId: evalCase.id,
        passed: false,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const finishedAt = new Date();
  const generationPassed = generationResults.filter((result) => result.passed).length;
  const modificationPassed = modificationResults.filter((result) => result.passed).length;

  const report: LiveEvalSuiteReport = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    generation: generationResults,
    modification: modificationResults,
    summary: {
      generationPassed,
      generationTotal: generationResults.length,
      modificationPassed,
      modificationTotal: modificationResults.length,
      totalPassed: generationPassed + modificationPassed,
      totalCases: generationResults.length + modificationResults.length,
    },
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  printLiveSuiteReport(report);
  console.log(`Saved live eval report to: ${reportPath}`);

  return report;
}

