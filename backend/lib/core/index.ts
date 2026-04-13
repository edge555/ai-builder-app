/**
 * @module core
 * @description Barrel export for core backend services used by API routes.
 * Re-exports the version manager and export service.
 *
 * @requires ./version-manager - Project version history management
 * @requires ./export-service - ZIP bundle export
 */

export { getVersionManager } from './version-manager';
export { exportAsZipBuffer } from './export-service';
