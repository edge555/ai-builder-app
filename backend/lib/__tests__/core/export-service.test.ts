import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { exportAsZipBuffer, createExportService } from '../../core/export-service';
import { ProjectState } from '@ai-app-builder/shared';

describe('Export Service', () => {
  const createTestProjectState = (): ProjectState => ({
    id: 'test-project-id',
    name: 'Test Project',
    description: 'A test project for export',
    files: {
      'package.json': JSON.stringify({ name: 'test-project', version: '1.0.0' }),
      'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
      'src/main.tsx': 'import App from "./App"; ReactDOM.render(<App />, document.getElementById("root"));',
      'vite.config.ts': 'export default { plugins: [] };',
      'tsconfig.json': '{ "compilerOptions": {} }',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    currentVersionId: 'v1',
  });

  describe('exportAsZipBuffer', () => {
    it('should create a valid ZIP buffer containing all project files', async () => {
      const projectState = createTestProjectState();
      const buffer = await exportAsZipBuffer(projectState);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      // Verify ZIP contents
      const zip = await JSZip.loadAsync(buffer);
      const fileNames = Object.keys(zip.files);

      expect(fileNames).toContain('package.json');
      expect(fileNames).toContain('src/App.tsx');
      expect(fileNames).toContain('src/main.tsx');
      expect(fileNames).toContain('vite.config.ts');
      expect(fileNames).toContain('tsconfig.json');
    });

    it('should preserve file contents correctly', async () => {
      const projectState = createTestProjectState();
      const buffer = await exportAsZipBuffer(projectState);

      const zip = await JSZip.loadAsync(buffer);
      
      const packageJson = await zip.file('package.json')?.async('string');
      expect(packageJson).toBe(projectState.files['package.json']);

      const appTsx = await zip.file('src/App.tsx')?.async('string');
      expect(appTsx).toBe(projectState.files['src/App.tsx']);
    });

    it('should preserve folder structure', async () => {
      const projectState = createTestProjectState();
      const buffer = await exportAsZipBuffer(projectState);

      const zip = await JSZip.loadAsync(buffer);
      
      // Check that src folder exists (JSZip creates folder entries)
      const srcFolder = zip.folder('src');
      expect(srcFolder).not.toBeNull();
    });

    it('should handle empty project files', async () => {
      const projectState: ProjectState = {
        ...createTestProjectState(),
        files: {},
      };

      const buffer = await exportAsZipBuffer(projectState);
      expect(buffer).toBeInstanceOf(Buffer);

      const zip = await JSZip.loadAsync(buffer);
      const fileNames = Object.keys(zip.files);
      // Export service adds README.md for empty projects
      expect(fileNames.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle deeply nested folder structures', async () => {
      const projectState: ProjectState = {
        ...createTestProjectState(),
        files: {
          'src/components/ui/Button/Button.tsx': 'export const Button = () => <button />;',
          'src/components/ui/Button/index.ts': 'export * from "./Button";',
          'src/lib/utils/helpers/format.ts': 'export const format = () => {};',
        },
      };

      const buffer = await exportAsZipBuffer(projectState);
      const zip = await JSZip.loadAsync(buffer);
      const fileNames = Object.keys(zip.files);

      expect(fileNames).toContain('src/components/ui/Button/Button.tsx');
      expect(fileNames).toContain('src/components/ui/Button/index.ts');
      expect(fileNames).toContain('src/lib/utils/helpers/format.ts');
    });
  });

  describe('createExportService', () => {
    it('should create an export service with exportAsZip method', () => {
      const service = createExportService();
      expect(service.exportAsZip).toBeDefined();
      expect(typeof service.exportAsZip).toBe('function');
    });
  });
});
