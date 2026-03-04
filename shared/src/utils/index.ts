/**
 * @module shared/utils
 * @description Sub-package entry point for shared utility functions.
 * Re-exports error messaging utilities, error message string builders, and diff helpers.
 *
 * @requires ./error-utils - Typed error construction helpers
 * @requires ./error-messages - Human-readable error message constructors
 * @requires ./diff - Text diff utilities for change detection
 */
export * from './error-utils';
export * from './error-messages';
export * from './diff';
