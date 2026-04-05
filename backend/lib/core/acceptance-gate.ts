import type { ValidationError } from '@ai-app-builder/shared';
import { createLogger } from '../logger';
import { ValidationPipeline } from './validation-pipeline';
import type { BuildError } from './build-validator';
import { createBuildValidator } from './build-validator';

const logger = createLogger('AcceptanceGate');

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

  validateStructure(files: Record<string, string>): AcceptanceResult {
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

    return {
      valid: true,
      sanitizedOutput: validationResult.sanitizedOutput,
      issues: [],
      validationErrors: [],
      buildErrors: [],
    };
  }

  validate(files: Record<string, string>): AcceptanceResult {
    const structureResult = this.validateStructure(files);
    if (!structureResult.valid || !structureResult.sanitizedOutput) {
      return structureResult;
    }

    const sanitizedOutput = structureResult.sanitizedOutput;
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
      issues: [
        ...buildErrors.map((error) => ({
          source: 'build' as const,
          type: error.type,
          message: error.message,
          file: error.file,
        })),
      ],
      validationErrors: [],
      buildErrors,
    };
  }
}

export function createAcceptanceGate(): AcceptanceGate {
  return new AcceptanceGate();
}
