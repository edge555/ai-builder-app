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
export type {
  GenerationResult,
} from './project-generator';

// Streaming Project Generator
export {
  StreamingProjectGenerator,
  createStreamingProjectGenerator,
} from './streaming-generator';
export type {
  StreamingGenerationResult,
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
