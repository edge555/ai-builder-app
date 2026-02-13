/**
 * Core Module Barrel Export
 * Re-exports all public symbols from core services.
 */

// Version Manager
export {
  VersionManager,
  getVersionManager,
  createVersionManager,
} from './version-manager';
export type {
  CreateVersionOptions,
  UndoRevertResult,
} from './version-manager';

// Project Generator
export {
  ProjectGenerator,
  createProjectGenerator,
} from './project-generator';
// Re-export from shared package
export type { OperationResult as GenerationResult } from '@ai-app-builder/shared';

// Streaming Project Generator
export {
  StreamingProjectGenerator,
  createStreamingProjectGenerator,
} from './streaming-generator';
// Re-export from shared package
export type { OperationResult as StreamingGenerationResult } from '@ai-app-builder/shared';
export type {
  StreamingCallbacks,
} from './streaming-generator';

// Export Service
export {
  exportAsZip,
  exportAsZipBuffer,
  createExportService,
} from './export-service';
export type {
  ExportService,
} from './export-service';

// Validation Pipeline
export {
  ValidationPipeline,
  validate,
} from './validation-pipeline';

// Validators
export {
  validateJsonStructure,
  validateFilePaths,
  detectForbiddenPatterns,
  validateSyntax,
  parseAIOutput,
} from './validators';

// Build Validator
export {
  BuildValidator,
  getBuildValidator,
  createBuildValidator,
} from './build-validator';
export type {
  BuildError,
  BuildValidationResult,
} from './build-validator';

