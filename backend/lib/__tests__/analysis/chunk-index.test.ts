/**
 * Tests for Chunk Index Builder
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 10.3, 10.4
 */

import { describe, it, expect } from 'vitest';
import { ChunkIndexBuilder, createChunkIndex } from '../../analysis/file-planner/chunk-index';
import type { ProjectState } from '@ai-app-builder/shared';

const createProjectState = (files: Record<string, string>): ProjectState => ({
  id: 'test-project',
  name: 'Test Project',
  description: 'A test project',
  files,
  createdAt: new Date(),
  updatedAt: new Date(),
  currentVersionId: 'v1',
});

describe('ChunkIndexBuilder', () => {
  describe('build', () => {
    it('should index all code files in a project', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
        'src/utils.ts': 'export function helper() { return 42; }',
      });

      const builder = new ChunkIndexBuilder();
      const index = builder.build(projectState);

      expect(index.chunksByFile.has('src/App.tsx')).toBe(true);
      expect(index.chunksByFile.has('src/utils.ts')).toBe(true);
    });

    it('should only parse code files (.ts, .tsx, .js, .jsx)', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export function App() { return <div />; }',
        'src/styles.css': '.app { color: red; }',
        'package.json': '{ "name": "test" }',
        'README.md': '# Test',
      });

      const builder = new ChunkIndexBuilder();
      const index = builder.build(projectState);

      // Code file should have chunks
      expect(index.chunksByFile.get('src/App.tsx')?.length).toBeGreaterThan(0);

      // Non-code files should have metadata but no chunks
      expect(index.chunksByFile.has('src/styles.css')).toBe(false);
      expect(index.fileMetadata.has('src/styles.css')).toBe(true);
      expect(index.fileMetadata.has('package.json')).toBe(true);
      expect(index.fileMetadata.has('README.md')).toBe(true);
    });
  });

  describe('parseFile - functions', () => {
    it('should extract function declarations', () => {
      const builder = new ChunkIndexBuilder();
      const chunks = builder.parseFile(
        'utils.ts',
        `export function calculateSum(a: number, b: number): number {
  return a + b;
}`
      );

      expect(chunks).toHaveLength(1);
      expect(chunks[0].symbolName).toBe('calculateSum');
      expect(chunks[0].chunkType).toBe('function');
      expect(chunks[0].isExported).toBe(true);
    });

    it('should extract arrow functions', () => {
      const builder = new ChunkIndexBuilder();
      const chunks = builder.parseFile(
        'utils.ts',
        `export const multiply = (a: number, b: number) => {
  return a * b;
};`
      );

      expect(chunks).toHaveLength(1);
      expect(chunks[0].symbolName).toBe('multiply');
      expect(chunks[0].chunkType).toBe('function');
    });

    it('should extract async functions', () => {
      const builder = new ChunkIndexBuilder();
      const chunks = builder.parseFile(
        'api.ts',
        `export async function fetchData(url: string) {
  const response = await fetch(url);
  return response.json();
}`
      );

      expect(chunks).toHaveLength(1);
      expect(chunks[0].symbolName).toBe('fetchData');
      expect(chunks[0].chunkType).toBe('function');
    });
  });

  describe('parseFile - React components', () => {
    it('should identify React function components', () => {
      const builder = new ChunkIndexBuilder();
      const chunks = builder.parseFile(
        'Button.tsx',
        `export function Button({ label }: { label: string }) {
  return <button>{label}</button>;
}`
      );

      expect(chunks).toHaveLength(1);
      expect(chunks[0].symbolName).toBe('Button');
      expect(chunks[0].chunkType).toBe('component');
    });

    it('should identify React arrow function components', () => {
      const builder = new ChunkIndexBuilder();
      const chunks = builder.parseFile(
        'Card.tsx',
        `export const Card = ({ title }: { title: string }) => {
  return <div className="card">{title}</div>;
};`
      );

      expect(chunks).toHaveLength(1);
      expect(chunks[0].symbolName).toBe('Card');
      expect(chunks[0].chunkType).toBe('component');
    });
  });

  describe('parseFile - classes', () => {
    it('should extract class declarations', () => {
      const builder = new ChunkIndexBuilder();
      const chunks = builder.parseFile(
        'service.ts',
        `export class UserService {
  private users: User[] = [];

  getUser(id: string): User | undefined {
    return this.users.find(u => u.id === id);
  }
}`
      );

      expect(chunks).toHaveLength(1);
      expect(chunks[0].symbolName).toBe('UserService');
      expect(chunks[0].chunkType).toBe('class');
    });
  });

  describe('parseFile - interfaces', () => {
    it('should extract interface declarations', () => {
      const builder = new ChunkIndexBuilder();
      const chunks = builder.parseFile(
        'types.ts',
        `export interface User {
  id: string;
  name: string;
  email: string;
}`
      );

      expect(chunks).toHaveLength(1);
      expect(chunks[0].symbolName).toBe('User');
      expect(chunks[0].chunkType).toBe('interface');
    });

    it('should extract interfaces with extends', () => {
      const builder = new ChunkIndexBuilder();
      const chunks = builder.parseFile(
        'types.ts',
        `export interface AdminUser extends User {
  permissions: string[];
}`
      );

      expect(chunks).toHaveLength(1);
      expect(chunks[0].symbolName).toBe('AdminUser');
      expect(chunks[0].chunkType).toBe('interface');
    });
  });

  describe('parseFile - type aliases', () => {
    it('should extract type alias declarations', () => {
      const builder = new ChunkIndexBuilder();
      const chunks = builder.parseFile(
        'types.ts',
        `export type Status = 'active' | 'inactive' | 'pending';`
      );

      expect(chunks).toHaveLength(1);
      expect(chunks[0].symbolName).toBe('Status');
      expect(chunks[0].chunkType).toBe('type');
    });
  });

  describe('parseFile - constants', () => {
    it('should extract constant declarations', () => {
      const builder = new ChunkIndexBuilder();
      const chunks = builder.parseFile(
        'constants.ts',
        `export const API_URL = 'https://api.example.com';`
      );

      expect(chunks).toHaveLength(1);
      expect(chunks[0].symbolName).toBe('API_URL');
      expect(chunks[0].chunkType).toBe('constant');
    });
  });

  describe('chunk properties', () => {
    it('should record correct line numbers', () => {
      const builder = new ChunkIndexBuilder();
      const chunks = builder.parseFile(
        'utils.ts',
        `// Comment
export function helper() {
  return 42;
}`
      );

      expect(chunks[0].startLine).toBe(2);
      expect(chunks[0].endLine).toBe(4);
    });

    it('should generate unique chunk IDs', () => {
      const builder = new ChunkIndexBuilder();
      const chunks = builder.parseFile(
        'utils.ts',
        `export function foo() { return 1; }
export function bar() { return 2; }`
      );

      expect(chunks[0].id).toBe('utils.ts#foo');
      expect(chunks[1].id).toBe('utils.ts#bar');
    });

    it('should track dependencies from imports', () => {
      const builder = new ChunkIndexBuilder();
      const chunks = builder.parseFile(
        'component.tsx',
        `import { useState, useEffect } from 'react';
import { formatDate } from './utils';

export function MyComponent() {
  const [date, setDate] = useState(new Date());
  useEffect(() => {
    console.log(formatDate(date));
  }, [date]);
  return <div>{date.toString()}</div>;
}`
      );

      const component = chunks.find((c) => c.symbolName === 'MyComponent');
      expect(component?.dependencies).toContain('useState');
      expect(component?.dependencies).toContain('useEffect');
      expect(component?.dependencies).toContain('formatDate');
    });
  });

  describe('extractSignature', () => {
    it('should extract function signature without body', () => {
      const builder = new ChunkIndexBuilder();
      const content = `export function calculateSum(a: number, b: number): number {
  return a + b;
}`;
      const signature = builder.extractSignature(content, 'function');

      expect(signature).toContain('calculateSum');
      expect(signature).toContain('a: number');
      expect(signature).not.toContain('return a + b');
    });

    it('should include full interface content for short interfaces', () => {
      const builder = new ChunkIndexBuilder();
      const content = `export interface User {
  id: string;
  name: string;
}`;
      const signature = builder.extractSignature(content, 'interface');

      expect(signature).toBe(content);
    });
  });

  describe('createChunkIndex helper', () => {
    it('should create and build a ChunkIndex', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      const index = createChunkIndex(projectState);

      expect(index.chunksByFile.has('src/App.tsx')).toBe(true);
    });
  });
});
