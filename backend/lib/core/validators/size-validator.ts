import type { ValidationError } from '@ai-app-builder/shared';
import { MAX_SINGLE_FILE_BYTES, MAX_PROJECT_BYTES } from '../../constants';

export function validateFileSizes(files: Record<string, string>): ValidationError[] {
  const errors: ValidationError[] = [];
  let totalBytes = 0;

  for (const [filePath, content] of Object.entries(files)) {
    const bytes = Buffer.byteLength(content, 'utf8');
    totalBytes += bytes;

    if (bytes > MAX_SINGLE_FILE_BYTES) {
      const kb = (bytes / 1024).toFixed(1);
      errors.push({
        type: 'file_too_large',
        message: `File exceeds 100 KB limit (${kb} KB)`,
        filePath,
      });
    }
  }

  if (totalBytes > MAX_PROJECT_BYTES) {
    const kb = (totalBytes / 1024).toFixed(1);
    errors.push({
      type: 'file_too_large',
      message: `Total project size exceeds 1 MB limit (${kb} KB)`,
    });
  }

  return errors;
}
