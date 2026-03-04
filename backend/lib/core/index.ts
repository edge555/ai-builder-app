/**
 * @module core
 * @description Barrel export for core backend services used by API routes.
 * Re-exports the version manager, project generator, and export service.
 *
 * @requires ./version-manager - Project version history management
 * @requires ./project-generator - Initial project creation
 * @requires ./export-service - ZIP bundle export
 */

export { getVersionManager } from './version-manager';
export { createProjectGenerator } from './project-generator';
export { exportAsZipBuffer } from './export-service';

