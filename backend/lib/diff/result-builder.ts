import { v4 as uuidv4 } from 'uuid';
import type {
  ProjectState,
  Version,
  ModificationResult,
  QualityReport,
} from '@ai-app-builder/shared';
import { computeDiffs } from './diff-computer';
import { createChangeSummary } from './change-summarizer';

export async function createModificationResult(
  projectState: ProjectState,
  updatedFiles: Record<string, string | null>,
  deletedFiles: string[],
  prompt: string,
  options?: { partialSuccess?: boolean; rolledBackFiles?: string[]; qualityReport?: QualityReport }
): Promise<ModificationResult> {
  const now = new Date();
  const versionId = uuidv4();

  const newFiles = { ...projectState.files };

  for (const [path, content] of Object.entries(updatedFiles)) {
    if (content === null) {
      delete newFiles[path];
    } else {
      newFiles[path] = content;
    }
  }

  const newProjectState: ProjectState = {
    ...projectState,
    files: newFiles,
    updatedAt: now,
    currentVersionId: versionId,
  };

  const diffs = computeDiffs(projectState.files, newFiles, deletedFiles);
  const changeSummary = createChangeSummary(diffs, prompt);

  const version: Version = {
    id: versionId,
    projectId: projectState.id,
    prompt: prompt,
    timestamp: now,
    files: newFiles,
    diffs: diffs,
    parentVersionId: projectState.currentVersionId,
  };

  return {
    success: true,
    projectState: newProjectState,
    version,
    diffs,
    changeSummary,
    ...(options?.partialSuccess && { partialSuccess: true }),
    ...(options?.rolledBackFiles?.length && { rolledBackFiles: options.rolledBackFiles }),
    ...(options?.qualityReport ? { qualityReport: options.qualityReport } : {}),
  };
}
