import type { ValidationError } from '@ai-app-builder/shared';
import { createLogger } from '../logger';
import { ValidationPipeline } from './validation-pipeline';
import type { BuildError } from './build-validator';
import { createBuildValidator } from './build-validator';

const logger = createLogger('AcceptanceGate');
const PLACEHOLDER_PATTERNS = [
  /subsequent phases/i,
  /todo:\s*implement/i,
  /replace this stub/i,
  /implement this file/i,
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

export class AcceptanceGate {
  private readonly validationPipeline = new ValidationPipeline();
  private readonly buildValidator = createBuildValidator();

  /**
   * Full validation: structural checks + placeholder detection + build validation.
   * Used by DiagnosticRepairEngine to verify each repair attempt.
   */
  validate(files: Record<string, string>): AcceptanceResult {
    const structuralResult = this.structuralValidate(files);
    if (!structuralResult.valid || !structuralResult.sanitizedOutput) {
      return structuralResult;
    }

    const sanitizedOutput = structuralResult.sanitizedOutput;
    const buildResult = this.buildValidator.validateAll(sanitizedOutput);
    const crossFileErrors = this.buildValidator.validateCrossFileReferences(sanitizedOutput);
    const buildErrors = [...buildResult.errors, ...crossFileErrors];

    if (buildErrors.length > 0) {
      logger.warn('Acceptance gate found build issues', {
        buildErrorCount: buildErrors.length,
        errorTypes: [...new Set(buildErrors.map((error) => error.type))],
      });
    }

    return {
      valid: buildErrors.length === 0,
      sanitizedOutput,
      issues: buildErrors.map((error) => ({
        source: 'build' as const,
        type: error.type,
        message: error.message,
        file: error.file,
      })),
      validationErrors: [],
      buildErrors,
    };
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
