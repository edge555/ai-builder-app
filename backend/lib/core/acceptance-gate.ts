import type { ValidationError } from '@ai-app-builder/shared';
import type { ProjectState } from '@ai-app-builder/shared';
import { createLogger } from '../logger';
import { ValidationPipeline } from './validation-pipeline';
import type { BuildError } from './build-validator';
import { createBuildValidator } from './build-validator';
import { indexProject } from '../analysis/file-index';
import { createDependencyGraph } from '../analysis/dependency-graph';

const logger = createLogger('AcceptanceGate');
const PLACEHOLDER_PATTERNS = [
  /\/\/.*subsequent phases/i,
  /todo:\s*implement/i,
  /replace this stub/i,
  /\/\/.*implement this file/i,
];

export interface AcceptanceIssue {
  source: 'validation' | 'build';
  message: string;
  file?: string;
  type: string;
}

export interface AcceptanceResult {
  valid: boolean;
  sanitizedOutput?: Record<string, string>;
  issues: AcceptanceIssue[];
  validationErrors: ValidationError[];
  buildErrors: BuildError[];
}

export interface AcceptanceValidationContext {
  changedFiles?: string[];
}

export class AcceptanceGate {
  private readonly validationPipeline = new ValidationPipeline();
  private readonly buildValidator = createBuildValidator();

  /**
   * Full validation: structural checks + placeholder detection + build validation.
   * Used by DiagnosticRepairEngine to verify each repair attempt.
   */
  validate(files: Record<string, string>, context?: AcceptanceValidationContext): AcceptanceResult {
    const structuralResult = this.structuralValidate(files);
    if (!structuralResult.valid || !structuralResult.sanitizedOutput) {
      return structuralResult;
    }

    const sanitizedOutput = structuralResult.sanitizedOutput;
    const buildScope = this.resolveBuildValidationScope(sanitizedOutput, context?.changedFiles);
    const buildResult = this.buildValidator.validateAll(buildScope);
    const crossFileErrors = this.buildValidator.validateCrossFileReferences(buildScope);
    const buildErrors = [...buildResult.errors, ...crossFileErrors];

    if (buildErrors.length > 0) {
      logger.warn('Acceptance gate found build issues', {
        buildErrorCount: buildErrors.length,
        errorTypes: [...new Set(buildErrors.map((error) => error.type))],
      });
    }

    const issues: AcceptanceIssue[] = buildErrors.map((error) => ({
        source: 'build' as const,
        type: error.type,
        message: error.message,
        file: error.file,
      }));



    return {
      valid: issues.length === 0,
      sanitizedOutput,
      issues,
      validationErrors: [],
      buildErrors,
    };
  }

  private resolveBuildValidationScope(
    files: Record<string, string>,
    changedFiles?: string[]
  ): Record<string, string> {
    if (!changedFiles || changedFiles.length === 0) {
      return files;
    }

    const existingChanged = changedFiles.filter((path) => path in files);
    if (existingChanged.length === 0) {
      return files;
    }

    try {
      const projectState: ProjectState = {
        id: '__acceptance_scope__',
        name: '__acceptance_scope__',
        description: '',
        files,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        currentVersionId: '__acceptance_scope__',
      };
      const fileIndex = indexProject(projectState);
      const dependencyGraph = createDependencyGraph(fileIndex);
      // Include both dependents (files that import the changed files) and
      // dependencies (files that the changed files import) so the build
      // validator can resolve all referenced modules.
      const dependents = dependencyGraph
        .getAffectedFiles(existingChanged)
        .filter((path) => path in files);
      const dependencies = existingChanged.flatMap((p) =>
        dependencyGraph.getDependencies(p).filter((dep) => dep in files)
      );
      const affectedSet = new Set([...dependents, ...dependencies]);
      const affectedPaths = Array.from(affectedSet);

      if (affectedPaths.length === 0) {
        return files;
      }

      const scopedFiles = Object.fromEntries(affectedPaths.map((path) => [path, files[path]]));

      // Always include package.json if any scoped file imports an external package.
      // The build validator needs it to verify dependency declarations.
      if ('package.json' in files && !('package.json' in scopedFiles)) {
        const hasExternalImport = existingChanged.some((path) => {
          const content = files[path] ?? '';
          return /from ['"][^./]/.test(content) || /require\(['"][^./]/.test(content);
        });
        if (hasExternalImport) {
          scopedFiles['package.json'] = files['package.json'];
        }
      }

      return scopedFiles;
    } catch (error) {
      logger.warn('Acceptance scope resolution failed; using full-file validation scope', {
        error: error instanceof Error ? error.message : String(error),
      });
      return files;
    }
  }

  /**
   * Light validation: structural checks + placeholder detection, no build validation.
   * Used as a pre-repair gate in ModificationEngine — build errors are handled by
   * DiagnosticRepairEngine, not rejected outright at this stage.
   */
  lightValidate(files: Record<string, string>): AcceptanceResult {
    return this.structuralValidate(files);
  }

  private structuralValidate(files: Record<string, string>): AcceptanceResult {
    const validationResult = this.validationPipeline.validate(files);
    if (!validationResult.valid || !validationResult.sanitizedOutput) {
      const validationErrors = validationResult.errors ?? [];
      return {
        valid: false,
        issues: validationErrors.map((error) => ({
          source: 'validation',
          type: error.type,
          message: error.message,
          file: error.filePath,
        })),
        validationErrors,
        buildErrors: [],
      };
    }

    const sanitizedOutput = validationResult.sanitizedOutput;
    const placeholderIssues = findPlaceholderIssues(sanitizedOutput);
    if (placeholderIssues.length > 0) {
      return {
        valid: false,
        sanitizedOutput,
        issues: placeholderIssues,
        validationErrors: [],
        buildErrors: [],
      };
    }

    return {
      valid: true,
      sanitizedOutput,
      issues: [],
      validationErrors: [],
      buildErrors: [],
    };
  }
}

export function createAcceptanceGate(): AcceptanceGate {
  return new AcceptanceGate();
}

function findPlaceholderIssues(files: Record<string, string>): AcceptanceIssue[] {
  const criticalFiles = Object.entries(files).filter(([path]) =>
    path === 'src/main.tsx' ||
    path === 'src/App.tsx' ||
    path === 'src/main.jsx' ||
    path === 'src/App.jsx' ||
    path === 'package.json'
  );

  return criticalFiles.flatMap(([path, content]) => {
    const matchedPattern = PLACEHOLDER_PATTERNS.find((pattern) => pattern.test(content));
    if (!matchedPattern) {
      return [];
    }

    return [{
      source: 'validation' as const,
      type: 'placeholder_content',
      message: 'Critical file contains placeholder content and was rejected',
      file: path,
    }];
  });
}

