/**
 * Validation Pipeline
 * Validates AI-generated output before applying changes to project state.
 * Refactored to delegate validation to specialized validators.
 */

import type { ValidationResult, ValidationError } from '@ai-app-builder/shared';
import { createLogger } from '../logger';
import {
  validateJsonStructure,
  validateFilePaths,
  detectForbiddenPatterns,
  validateSyntax,
  validateModularArchitecture,
  parseAIOutput
} from './validators';

const logger = createLogger('validation-pipeline');

/**
 * Main validation pipeline that runs all validators.
 */
export function validate(aiOutput: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  // Step 1: Validate JSON structure
  const jsonErrors = validateJsonStructure(aiOutput);
  if (jsonErrors.length > 0) {
    return {
      valid: false,
      errors: jsonErrors,
    };
  }

  const files = aiOutput as Record<string, string>;

  // Step 2: Validate file paths
  errors.push(...validateFilePaths(files));

  // Step 3: Detect forbidden patterns
  errors.push(...detectForbiddenPatterns(files));

  // Step 4: Validate syntax
  errors.push(...validateSyntax(files));

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
    };
  }

  // Step 5: Check modular architecture (non-blocking warnings)
  const architectureWarnings = validateModularArchitecture(files);
  if (architectureWarnings.length > 0) {
    logger.info('=== ARCHITECTURE WARNINGS ===');
    for (const warning of architectureWarnings) {
      logger.warn(`${warning.message}${warning.filePath ? ` (${warning.filePath})` : ''}`);
    }
    logger.info('These are suggestions for better code structure.');
  }

  return {
    valid: true,
    errors: architectureWarnings, // Include as informational warnings
    sanitizedOutput: files,
  };
}

/**
 * ValidationPipeline class for service-oriented usage.
 */
export class ValidationPipeline {
  validate(aiOutput: unknown): ValidationResult {
    return validate(aiOutput);
  }

  parseAndValidate(rawOutput: string): ValidationResult & { parseError?: string } {
    const parseResult = parseAIOutput(rawOutput);

    if (!parseResult.success) {
      return {
        valid: false,
        errors: [{
          type: 'invalid_json',
          message: parseResult.error || 'Failed to parse AI output',
        }],
        parseError: parseResult.error,
      };
    }

    return this.validate(parseResult.data);
  }
}
