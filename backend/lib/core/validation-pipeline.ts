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
  validateCssSyntax,
  validateCssClassConsistency,
  validateProjectQuality,
  validateFileSizes,
  validateProjectStructure,
  parseAIOutput
} from './validators';

const logger = createLogger('validation-pipeline');

/**
 * Main validation pipeline that runs all validators.
 */
function validate(aiOutput: unknown): ValidationResult {
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

  // Step 1.5: Validate project structure
  errors.push(...validateProjectStructure(files));

  // Step 2: Validate file paths
  errors.push(...validateFilePaths(files));

  // Step 2.5: Validate file sizes
  errors.push(...validateFileSizes(files));

  // Step 3: Detect forbidden patterns
  errors.push(...detectForbiddenPatterns(files));

  // Step 4: Validate syntax
  errors.push(...validateSyntax(files));
  errors.push(...validateCssSyntax(files));

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
    };
  }

  // Step 5: Check project quality (architecture + styling + CSS class consistency, non-blocking warnings)
  const qualityWarnings = [
    ...validateProjectQuality(files),
    ...validateCssClassConsistency(files),
  ];
  if (qualityWarnings.length > 0) {
    logger.info('=== PROJECT QUALITY WARNINGS ===');
    for (const warning of qualityWarnings) {
      logger.warn(`${warning.message}${warning.filePath ? ` (${warning.filePath})` : ''}`);
    }
    logger.info('These are suggestions for better code structure and styling.');
  }

  return {
    valid: true,
    errors: [],
    warnings: qualityWarnings.length > 0 ? qualityWarnings : undefined,
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
