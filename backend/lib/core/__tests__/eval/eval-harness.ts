import { createAcceptanceGate } from '../../acceptance-gate';
import type { ProjectOutput } from '../../schemas';
import { REFERENCE_PROMPTS, type ReferencePrompt } from './reference-prompts';
import { scoreOutput, type ScoreResult } from './scoring';
import type { GenerationEvalCase, ModificationEvalCase } from './eval-cases';
import { runRuntimeSmokeTest, type RuntimeSmokeResult } from './runtime-smoke';

export interface GenerationEvalResult {
  caseId: string;
  passed: boolean;
  acceptancePassed: boolean;
  runtimePassed: boolean;
  scoreResult?: ScoreResult;
  runtimeSmoke: RuntimeSmokeResult;
  issues: string[];
}

export interface ModificationEvalResult {
  caseId: string;
  passed: boolean;
  acceptancePassed: boolean;
  runtimePassed: boolean;
  changedFiles: string[];
  runtimeSmoke: RuntimeSmokeResult;
  issues: string[];
}

function filesToRecord(output: ProjectOutput): Record<string, string> {
  return Object.fromEntries(output.files.map((file) => [file.path, file.content]));
}

function findReferencePrompt(referencePromptId?: string): ReferencePrompt | undefined {
  if (!referencePromptId) {
    return undefined;
  }

  return REFERENCE_PROMPTS.find((prompt) => prompt.id === referencePromptId);
}

function collectPatternIssues(allContent: string, requiredPatterns: string[] = [], forbiddenPatterns: string[] = []): string[] {
  const issues: string[] = [];

  for (const pattern of requiredPatterns) {
    if (!allContent.includes(pattern)) {
      issues.push(`Missing required pattern: ${pattern}`);
    }
  }

  for (const pattern of forbiddenPatterns) {
    if (allContent.includes(pattern)) {
      issues.push(`Found forbidden pattern: ${pattern}`);
    }
  }

  return issues;
}

export function runGenerationEvalCase(evalCase: GenerationEvalCase): GenerationEvalResult {
  const acceptanceGate = createAcceptanceGate();
  const files = filesToRecord(evalCase.output);
  const acceptance = acceptanceGate.validate(files);
  const runtimeSmoke = runRuntimeSmokeTest(files);
  const referencePrompt = findReferencePrompt(evalCase.referencePromptId);
  const scoreResult = referencePrompt ? scoreOutput(referencePrompt, evalCase.output) : undefined;
  const allContent = evalCase.output.files.map((file) => `${file.path}\n${file.content}`).join('\n');

  const issues = [
    ...acceptance.issues.map((issue) => issue.message),
    ...runtimeSmoke.issues.map((issue) => issue.message),
    ...collectPatternIssues(allContent, evalCase.requiredPatterns, evalCase.forbiddenPatterns),
  ];

  if (scoreResult && !scoreResult.passed) {
    issues.push(`Reference score below threshold: ${scoreResult.score}/100`);
  }

  return {
    caseId: evalCase.id,
    passed: acceptance.valid && runtimeSmoke.passed && (!scoreResult || scoreResult.passed) && issues.length === 0,
    acceptancePassed: acceptance.valid,
    runtimePassed: runtimeSmoke.passed,
    scoreResult,
    runtimeSmoke,
    issues,
  };
}

export function runModificationEvalCase(evalCase: ModificationEvalCase): ModificationEvalResult {
  const acceptanceGate = createAcceptanceGate();
  const acceptance = acceptanceGate.validate(evalCase.afterFiles);
  const runtimeSmoke = runRuntimeSmokeTest(evalCase.afterFiles);
  const changedFiles = Object.keys(evalCase.afterFiles).filter(
    (path) => evalCase.beforeFiles[path] !== evalCase.afterFiles[path],
  );
  const allContent = Object.entries(evalCase.afterFiles)
    .map(([path, content]) => `${path}\n${content}`)
    .join('\n');

  const issues = [
    ...acceptance.issues.map((issue) => issue.message),
    ...runtimeSmoke.issues.map((issue) => issue.message),
  ];

  for (const requiredFile of evalCase.requiredChangedFiles) {
    if (!changedFiles.includes(requiredFile)) {
      issues.push(`Required changed file was not modified: ${requiredFile}`);
    }
  }

  for (const unchangedFile of evalCase.unchangedFiles ?? []) {
    if (evalCase.beforeFiles[unchangedFile] !== evalCase.afterFiles[unchangedFile]) {
      issues.push(`Expected file to remain unchanged: ${unchangedFile}`);
    }
  }

  issues.push(...collectPatternIssues(allContent, evalCase.requiredPatterns));

  return {
    caseId: evalCase.id,
    passed: acceptance.valid && runtimeSmoke.passed && issues.length === 0,
    acceptancePassed: acceptance.valid,
    runtimePassed: runtimeSmoke.passed,
    changedFiles,
    runtimeSmoke,
    issues,
  };
}

