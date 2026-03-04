/**
 * @module shared
 * @description Public entry point for the `@ai-app-builder/shared` package.
 * Re-exports all shared types, utility functions, and API schemas used by
 * both the frontend and backend packages.
 *
 * @requires ./types - Shared domain types (ProjectState, CodeSlice, etc.)
 * @requires ./utils - Utility functions (error messages, diff helpers)
 * @requires ./schemas/api - Zod API request/response schemas
 */

// Re-export all types
export * from './types';
export * from './utils';
export * from './schemas/api';
