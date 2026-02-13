/**
 * Tests for File Index Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FileIndex, indexProject } from '../../analysis/file-index';
import type { ProjectState } from '@ai-app-builder/shared';

describe('FileIndex', () => {
  let fileIndex: FileIndex;

  beforeEach(() => {
    fileIndex = new FileIndex();
  });

  const createProjectState = (files: Record<string, string>): ProjectState => ({
    id: 'test-project',
    name: 'Test Project',
    description: 'A test project',
    files,
    createdAt: new Date(),
    updatedAt: new Date(),
    currentVersionId: 'v1',
  });

  describe('index', () => {
    it('should index all files in a project', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
        'src/utils.ts': 'export function helper() { return 42; }',
      });

      fileIndex.index(projectState);

      expect(fileIndex.getEntry('src/App.tsx')).not.toBeNull();
      expect(fileIndex.getEntry('src/utils.ts')).not.toBeNull();
    });

    it('should clear previous entries when re-indexing', () => {
      const projectState1 = createProjectState({
        'src/old.ts': 'export const old = 1;',
      });
      const projectState2 = createProjectState({
        'src/new.ts': 'export const newVal = 2;',
      });

      fileIndex.index(projectState1);
      fileIndex.index(projectState2);

      expect(fileIndex.getEntry('src/old.ts')).toBeNull();
      expect(fileIndex.getEntry('src/new.ts')).not.toBeNull();
    });

    it('should incrementally update only changed files', () => {
      const projectState1 = createProjectState({
        'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
        'src/utils.ts': 'export function helper() { return 42; }',
      });

      fileIndex.index(projectState1);
      const entry1_App = fileIndex.getEntry('src/App.tsx');
      const entry1_Utils = fileIndex.getEntry('src/utils.ts');

      expect(entry1_App).not.toBeNull();
      expect(entry1_Utils).not.toBeNull();

      const projectState2 = createProjectState({
        'src/App.tsx': 'export default function App() { return <div>Hello World</div>; }',
        'src/utils.ts': 'export function helper() { return 42; }',
      });

      fileIndex.index(projectState2);
      const entry2_App = fileIndex.getEntry('src/App.tsx');
      const entry2_Utils = fileIndex.getEntry('src/utils.ts');

      // Changed file should have a new entry
      expect(entry2_App).not.toBe(entry1_App);
      expect(entry2_App?.hash).not.toBe(entry1_App?.hash);

      // Unchanged file should have the EXACT SAME entry object (incremental)
      expect(entry2_Utils).toBe(entry1_Utils);
      expect(entry2_Utils?.hash).toBe(entry1_Utils?.hash);
    });

    it('should remove entries for deleted files', () => {
      const projectState1 = createProjectState({
        'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
        'src/utils.ts': 'export function helper() { return 42; }',
      });

      fileIndex.index(projectState1);
      expect(fileIndex.getEntry('src/utils.ts')).not.toBeNull();

      const projectState2 = createProjectState({
        'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
      });

      fileIndex.index(projectState2);
      expect(fileIndex.getEntry('src/utils.ts')).toBeNull();
      expect(fileIndex.getEntry('src/App.tsx')).not.toBeNull();
    });
  });

  describe('parseExports', () => {
    it('should parse default function exports', () => {
      const projectState = createProjectState({
        'src/Component.tsx': 'export default function MyComponent() { return <div />; }',
      });

      fileIndex.index(projectState);
      const exports = fileIndex.getExports('src/Component.tsx');

      expect(exports).toContainEqual({
        name: 'MyComponent',
        type: 'default',
        kind: 'component',
      });
    });

    it('should parse named function exports', () => {
      const projectState = createProjectState({
        'src/utils.ts': 'export function calculateSum(a: number, b: number) { return a + b; }',
      });

      fileIndex.index(projectState);
      const exports = fileIndex.getExports('src/utils.ts');

      expect(exports).toContainEqual({
        name: 'calculateSum',
        type: 'named',
        kind: 'function',
      });
    });

    it('should parse named const exports', () => {
      const projectState = createProjectState({
        'src/constants.ts': 'export const API_URL = "https://api.example.com";',
      });

      fileIndex.index(projectState);
      const exports = fileIndex.getExports('src/constants.ts');

      expect(exports).toContainEqual({
        name: 'API_URL',
        type: 'named',
        kind: 'constant',
      });
    });

    it('should parse interface exports', () => {
      const projectState = createProjectState({
        'src/types.ts': 'export interface User { id: string; name: string; }',
      });

      fileIndex.index(projectState);
      const exports = fileIndex.getExports('src/types.ts');

      expect(exports).toContainEqual({
        name: 'User',
        type: 'named',
        kind: 'interface',
      });
    });

    it('should parse type exports', () => {
      const projectState = createProjectState({
        'src/types.ts': 'export type Status = "active" | "inactive";',
      });

      fileIndex.index(projectState);
      const exports = fileIndex.getExports('src/types.ts');

      expect(exports).toContainEqual({
        name: 'Status',
        type: 'named',
        kind: 'type',
      });
    });
  });


  describe('parseImports', () => {
    it('should parse named imports', () => {
      const projectState = createProjectState({
        'src/App.tsx': `import { useState, useEffect } from 'react';
export default function App() { return <div />; }`,
      });

      fileIndex.index(projectState);
      const imports = fileIndex.getImports('src/App.tsx');

      expect(imports).toContainEqual({
        source: 'react',
        specifiers: ['useState', 'useEffect'],
        isRelative: false,
      });
    });

    it('should parse default imports', () => {
      const projectState = createProjectState({
        'src/App.tsx': `import React from 'react';
export default function App() { return <div />; }`,
      });

      fileIndex.index(projectState);
      const imports = fileIndex.getImports('src/App.tsx');

      expect(imports).toContainEqual({
        source: 'react',
        specifiers: ['React'],
        isRelative: false,
      });
    });

    it('should parse relative imports', () => {
      const projectState = createProjectState({
        'src/App.tsx': `import { helper } from './utils';
export default function App() { return <div />; }`,
      });

      fileIndex.index(projectState);
      const imports = fileIndex.getImports('src/App.tsx');

      expect(imports).toContainEqual({
        source: './utils',
        specifiers: ['helper'],
        isRelative: true,
      });
    });

    it('should parse namespace imports', () => {
      const projectState = createProjectState({
        'src/App.tsx': `import * as Utils from './utils';
export default function App() { return <div />; }`,
      });

      fileIndex.index(projectState);
      const imports = fileIndex.getImports('src/App.tsx');

      expect(imports).toContainEqual({
        source: './utils',
        specifiers: ['Utils'],
        isRelative: true,
      });
    });
  });

  describe('determineFileType', () => {
    it('should identify config files', () => {
      const projectState = createProjectState({
        'vite.config.ts': 'export default {}',
        'tsconfig.json': '{}',
      });

      fileIndex.index(projectState);

      expect(fileIndex.getEntry('vite.config.ts')?.fileType).toBe('config');
      expect(fileIndex.getEntry('tsconfig.json')?.fileType).toBe('config');
    });

    it('should identify style files', () => {
      const projectState = createProjectState({
        'src/styles.css': '.app { color: red; }',
      });

      fileIndex.index(projectState);

      expect(fileIndex.getEntry('src/styles.css')?.fileType).toBe('style');
    });

    it('should identify API routes', () => {
      const projectState = createProjectState({
        'app/api/users/route.ts': 'export async function GET() {}',
      });

      fileIndex.index(projectState);

      expect(fileIndex.getEntry('app/api/users/route.ts')?.fileType).toBe('api_route');
    });

    it('should identify components', () => {
      const projectState = createProjectState({
        'src/components/Button.tsx': 'export default function Button() { return <button />; }',
      });

      fileIndex.index(projectState);

      expect(fileIndex.getEntry('src/components/Button.tsx')?.fileType).toBe('component');
    });
  });

  describe('search', () => {
    it('should find files by path', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
        'src/utils.ts': 'export function helper() {}',
      });

      fileIndex.index(projectState);
      const results = fileIndex.search('App');

      expect(results).toHaveLength(1);
      expect(results[0].filePath).toBe('src/App.tsx');
    });

    it('should find files by component name', () => {
      const projectState = createProjectState({
        'src/components/Button.tsx': 'export default function Button() { return <button>Click</button>; }',
      });

      fileIndex.index(projectState);
      const results = fileIndex.search('Button');

      expect(results).toHaveLength(1);
      expect(results[0].filePath).toBe('src/components/Button.tsx');
    });

    it('should find files by export name', () => {
      const projectState = createProjectState({
        'src/utils.ts': 'export function calculateTotal() { return 0; }',
      });

      fileIndex.index(projectState);
      const results = fileIndex.search('calculateTotal');

      expect(results).toHaveLength(1);
      expect(results[0].filePath).toBe('src/utils.ts');
    });
  });

  describe('indexProject helper', () => {
    it('should create and index a FileIndex', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      const index = indexProject(projectState);

      expect(index.getEntry('src/App.tsx')).not.toBeNull();
    });
  });
});
