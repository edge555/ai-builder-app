import type { ValidationError } from '@ai-app-builder/shared';

const ENTRY_POINTS = ['src/App.tsx', 'src/App.jsx', 'src/index.tsx', 'src/main.tsx'];

export function validateProjectStructure(files: Record<string, string>): ValidationError[] {
  const errors: ValidationError[] = [];
  const filePaths = Object.keys(files);

  // Check package.json exists
  const packageJsonPath = filePaths.find(p => p === 'package.json' || p.endsWith('/package.json'));
  if (!packageJsonPath) {
    errors.push({
      type: 'missing_structure',
      message: 'Missing package.json',
    });
  } else {
    const content = files[packageJsonPath];

    // Validate it's valid JSON
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      errors.push({
        type: 'missing_structure',
        message: 'package.json is not valid JSON',
        filePath: packageJsonPath,
      });
    }

    if (parsed) {
      if (!parsed.name) {
        errors.push({
          type: 'missing_structure',
          message: 'package.json is missing "name" field',
          filePath: packageJsonPath,
        });
      }
      if (!parsed.dependencies) {
        errors.push({
          type: 'missing_structure',
          message: 'package.json is missing "dependencies" field',
          filePath: packageJsonPath,
        });
      }
    }
  }

  // Check for an entry point
  const hasEntryPoint = filePaths.some(p =>
    ENTRY_POINTS.some(ep => p === ep || p.endsWith(`/${ep}`))
  );
  if (!hasEntryPoint) {
    errors.push({
      type: 'missing_structure',
      message: `No entry point found. Expected one of: ${ENTRY_POINTS.join(', ')}`,
    });
  }

  return errors;
}
