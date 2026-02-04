import JSZip from 'jszip';
import { ProjectState } from '@ai-app-builder/shared';

/**
 * Export Service
 * 
 * Handles exporting ProjectState to downloadable ZIP files.
 * Preserves folder structure and includes all project files.
 * 
 * Requirements: 7.1, 7.2, 7.3
 */

export interface ExportService {
  exportAsZip(projectState: ProjectState): Promise<Blob>;
}

/**
 * Creates a ZIP file containing all files from the ProjectState.
 * 
 * @param projectState - The project state to export
 * @returns A Blob containing the ZIP file
 * 
 * Requirements:
 * - 7.1: Generate a ZIP file containing all project files
 * - 7.2: Preserve the complete folder structure
 * - 7.3: Include all necessary configuration files
 */
export async function exportAsZip(projectState: ProjectState): Promise<Blob> {
  const zip = new JSZip();

  // Add all files from ProjectState to ZIP
  // The file paths already include folder structure (e.g., "src/App.tsx")
  for (const [filePath, content] of Object.entries(projectState.files)) {
    // JSZip automatically creates folder structure from paths
    zip.file(filePath, content);
  }

  // Generate the ZIP file as a Blob
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6, // Balanced compression level
    },
  });

  return blob;
}

/**
 * Creates a ZIP file and returns it as a Buffer (for Node.js environments).
 * 
 * @param projectState - The project state to export
 * @returns A Buffer containing the ZIP file
 */
export async function exportAsZipBuffer(projectState: ProjectState): Promise<Buffer> {
  const zip = new JSZip();

  // Add all files from ProjectState to ZIP
  for (const [filePath, content] of Object.entries(projectState.files)) {
    zip.file(filePath, content);
  }

  // Generate the ZIP file as a Node.js Buffer
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6,
    },
  });

  return buffer;
}

/**
 * Creates a default ExportService implementation.
 */
export function createExportService(): ExportService {
  return {
    exportAsZip,
  };
}
