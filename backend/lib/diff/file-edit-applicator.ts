import type { ProjectState } from '@ai-app-builder/shared';
import { formatCode } from '../prettier-config';
import { applyEdits } from './edit-applicator';
import { createLogger } from '../logger';

const logger = createLogger('FileEditApplicator');

type FileEdit = {
  path: string;
  operation: string;
  content?: string;
  edits?: Array<{ search: string; replace: string }>;
};

export async function applyFileEdits(
  aiFilesArray: FileEdit[],
  projectState: ProjectState
): Promise<{
  success: boolean;
  updatedFiles?: Record<string, string | null>;
  deletedFiles?: string[];
  error?: string;
}> {
  const updatedFiles: Record<string, string | null> = {};
  const deletedFiles: string[] = [];

  for (const fileEdit of aiFilesArray) {
    if (!fileEdit.path) {
      logger.warn('Skipping file entry without path');
      continue;
    }

    // Sanitize path: remove any accidental spaces
    fileEdit.path = fileEdit.path.replace(/\s+/g, '');

    switch (fileEdit.operation) {
      case 'delete':
        deletedFiles.push(fileEdit.path);
        updatedFiles[fileEdit.path] = null;
        break;

      case 'create': {
        if (!fileEdit.content) {
          logger.warn('Create operation missing content', { path: fileEdit.path });
          continue;
        }
        let createContent = fileEdit.content;
        if (createContent.includes('\\n')) createContent = createContent.replace(/\\n/g, '\n');
        if (createContent.includes('\\t')) createContent = createContent.replace(/\\t/g, '\t');
        try {
          createContent = await formatCode(createContent, fileEdit.path);
        } catch (e) {
          logger.warn('Failed to format file', { path: fileEdit.path, error: e instanceof Error ? e.message : 'Unknown error' });
        }
        updatedFiles[fileEdit.path] = createContent;
        break;
      }

      case 'modify': {
        if (!fileEdit.edits || fileEdit.edits.length === 0) {
          logger.warn('Modify operation missing edits', { path: fileEdit.path });
          continue;
        }
        const originalContent = projectState.files[fileEdit.path];
        if (originalContent === undefined) {
          logger.warn('Cannot modify non-existent file', { path: fileEdit.path });
          continue;
        }
        const editResult = applyEdits(originalContent, fileEdit.edits);
        if (!editResult.success) {
          logger.warn('Failed to apply edits', { path: fileEdit.path, error: editResult.error });
          return { success: false, error: `File: ${fileEdit.path} - ${editResult.error}` };
        }
        let modifiedContent = editResult.content!;
        try {
          modifiedContent = await formatCode(modifiedContent, fileEdit.path);
        } catch (e) {
          logger.warn('Failed to format file', { path: fileEdit.path, error: e instanceof Error ? e.message : 'Unknown error' });
        }
        updatedFiles[fileEdit.path] = modifiedContent;
        break;
      }

      case 'replace_file': {
        if (!fileEdit.content) {
          logger.warn('replace_file operation missing content', { path: fileEdit.path });
          continue;
        }
        if (projectState.files[fileEdit.path] === undefined) {
          logger.warn('replace_file target does not exist, treating as create', { path: fileEdit.path });
        }
        let replaceContent = fileEdit.content;
        if (replaceContent.includes('\\n')) replaceContent = replaceContent.replace(/\\n/g, '\n');
        if (replaceContent.includes('\\t')) replaceContent = replaceContent.replace(/\\t/g, '\t');
        try {
          replaceContent = await formatCode(replaceContent, fileEdit.path);
        } catch (e) {
          logger.warn('Failed to format file', { path: fileEdit.path, error: e instanceof Error ? e.message : 'Unknown error' });
        }
        updatedFiles[fileEdit.path] = replaceContent;
        break;
      }

      default:
        logger.warn('Unknown operation type', { path: (fileEdit as any).path });
    }
  }

  return { success: true, updatedFiles, deletedFiles };
}
