/**
 * Tests for File Tree Metadata Generator
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import { describe, it, expect } from 'vitest';
import {
  generateFileTreeMetadata,
  estimateTokens,
  isWithinTokenBudget,
} from '../../analysis/file-planner/metadata-generator';
import { createChunkIndex } from '../../analysis/file-planner/chunk-index';
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

describe('generateFileTreeMetadata', () => {
  it('should generate tree structure with file info', () => {
    const projectState = createProjectState({
      'src/App.tsx': 'export function App() { return <div>Hello</div>; }',
      'src/utils.ts': 'export function helper() { return 42; }',
    });

    const chunkIndex = createChunkIndex(projectState);
    const metadata = generateFileTreeMetadata(chunkIndex);

    expect(metadata).toContain('src/');
    expect(metadata).toContain('App.tsx');
    expect(metadata).toContain('utils.ts');
    expect(metadata).toContain('lines');
  });

  it('should show line counts for files', () => {
    const projectState = createProjectState({
      'index.ts': 'line1\nline2\nline3',
    });

    const chunkIndex = createChunkIndex(projectState);
    const metadata = generateFileTreeMetadata(chunkIndex);

    expect(metadata).toContain('(3 lines)');
  });

  it('should show file types', () => {
    const projectState = createProjectState({
      'src/components/Button.tsx': 'export function Button() { return <button />; }',
      'src/utils/helper.ts': 'export function helper() { return 1; }',
      'styles.css': '.app { color: red; }',
    });

    const chunkIndex = createChunkIndex(projectState);
    const metadata = generateFileTreeMetadata(chunkIndex);

    expect(metadata).toContain('[component]');
    expect(metadata).toContain('[utility]');
    expect(metadata).toContain('[style]');
  });

  it('should show exported symbol names', () => {
    const projectState = createProjectState({
      'types.ts': `export interface User { id: string; }
export type Status = 'active' | 'inactive';`,
    });

    const chunkIndex = createChunkIndex(projectState);
    const metadata = generateFileTreeMetadata(chunkIndex);

    expect(metadata).toContain('exports:');
    expect(metadata).toContain('User');
    expect(metadata).toContain('Status');
  });

  it('should NOT include any code content', () => {
    const projectState = createProjectState({
      'src/App.tsx': `export function App() {
  const message = "Hello World";
  return <div className="app">{message}</div>;
}`,
    });

    const chunkIndex = createChunkIndex(projectState);
    const metadata = generateFileTreeMetadata(chunkIndex);

    // Should not contain function bodies or JSX
    expect(metadata).not.toContain('const message');
    expect(metadata).not.toContain('Hello World');
    expect(metadata).not.toContain('<div');
    expect(metadata).not.toContain('className');
    expect(metadata).not.toContain('return');
  });

  it('should organize files in directory hierarchy', () => {
    const projectState = createProjectState({
      'src/components/Button.tsx': 'export function Button() { return <button />; }',
      'src/components/Card.tsx': 'export function Card() { return <div />; }',
      'src/utils/format.ts': 'export function format() { return ""; }',
    });

    const chunkIndex = createChunkIndex(projectState);
    const metadata = generateFileTreeMetadata(chunkIndex);

    // Check directory structure
    expect(metadata).toContain('src/');
    expect(metadata).toContain('components/');
    expect(metadata).toContain('utils/');
  });
});

describe('estimateTokens', () => {
  it('should estimate tokens at ~4 chars per token', () => {
    const content = 'a'.repeat(100);
    const tokens = estimateTokens(content);
    expect(tokens).toBe(25);
  });

  it('should round up token count', () => {
    const content = 'abc'; // 3 chars
    const tokens = estimateTokens(content);
    expect(tokens).toBe(1); // ceil(3/4) = 1
  });
});

describe('isWithinTokenBudget', () => {
  it('should return true for small metadata', () => {
    const metadata = 'a'.repeat(100);
    expect(isWithinTokenBudget(metadata)).toBe(true);
  });

  it('should return false for large metadata', () => {
    const metadata = 'a'.repeat(5000); // 1250 tokens
    expect(isWithinTokenBudget(metadata)).toBe(false);
  });

  it('should respect custom budget', () => {
    const metadata = 'a'.repeat(100); // 25 tokens
    expect(isWithinTokenBudget(metadata, 20)).toBe(false);
    expect(isWithinTokenBudget(metadata, 30)).toBe(true);
  });
});

describe('Property 4: Metadata No-Code Invariant', () => {
  /**
   * Validates: Requirements 2.3
   *
   * For any generated file tree metadata string, it SHALL NOT contain
   * any code patterns: function bodies, JSX elements, or multi-line code blocks.
   */
  it('should not contain function bodies with curly braces and statements', () => {
    const projectState = createProjectState({
      'src/App.tsx': `export function App() {
  const [count, setCount] = useState(0);
  const handleClick = () => setCount(c => c + 1);
  return (
    <div className="app">
      <button onClick={handleClick}>{count}</button>
    </div>
  );
}`,
      'src/utils.ts': `export function calculate(a: number, b: number): number {
  const sum = a + b;
  const product = a * b;
  return sum + product;
}`,
    });

    const chunkIndex = createChunkIndex(projectState);
    const metadata = generateFileTreeMetadata(chunkIndex);

    // Should not contain variable declarations from function bodies
    expect(metadata).not.toContain('const [count');
    expect(metadata).not.toContain('setCount');
    expect(metadata).not.toContain('handleClick');
    expect(metadata).not.toContain('const sum');
    expect(metadata).not.toContain('const product');
  });

  it('should not contain JSX elements', () => {
    const projectState = createProjectState({
      'src/Button.tsx': `export function Button({ label }: { label: string }) {
  return <button className="btn">{label}</button>;
}`,
    });

    const chunkIndex = createChunkIndex(projectState);
    const metadata = generateFileTreeMetadata(chunkIndex);

    // Should not contain JSX
    expect(metadata).not.toContain('<button');
    expect(metadata).not.toContain('</button>');
    expect(metadata).not.toContain('className=');
    expect(metadata).not.toContain('{label}');
  });
});

describe('Property 5: Metadata Compactness', () => {
  /**
   * Validates: Requirements 2.4
   *
   * For any project with N files where N <= 50, the generated file tree
   * metadata SHALL have an estimated token count less than 1000 tokens.
   */
  it('should stay under 1000 tokens for a typical project', () => {
    // Create a project with 30 files (typical size)
    const files: Record<string, string> = {};
    for (let i = 0; i < 30; i++) {
      files[`src/components/Component${i}.tsx`] = `export function Component${i}() {
  return <div>Component ${i}</div>;
}
export interface Component${i}Props {
  title: string;
}`;
    }

    const projectState = createProjectState(files);
    const chunkIndex = createChunkIndex(projectState);
    const metadata = generateFileTreeMetadata(chunkIndex);

    const tokens = estimateTokens(metadata);
    expect(tokens).toBeLessThan(1000);
  });

  it('should stay under 1000 tokens for 50 files', () => {
    // Create a project with exactly 50 files
    const files: Record<string, string> = {};
    for (let i = 0; i < 50; i++) {
      files[`src/file${i}.ts`] = `export function func${i}() { return ${i}; }`;
    }

    const projectState = createProjectState(files);
    const chunkIndex = createChunkIndex(projectState);
    const metadata = generateFileTreeMetadata(chunkIndex);

    const tokens = estimateTokens(metadata);
    expect(tokens).toBeLessThan(1000);
  });
});
