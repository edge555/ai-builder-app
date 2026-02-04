/**
 * Tests for Token Budget Manager
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import { describe, it, expect } from 'vitest';
import { TokenBudgetManager, createTokenBudgetManager } from '../../analysis/file-planner/token-budget';
import { buildChunkIndex } from '../../analysis/file-planner/chunk-index';
import type { CodeSlice, ChunkIndex } from '../../analysis/file-planner/types';
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

describe('TokenBudgetManager', () => {
  describe('estimateTokens', () => {
    it('should estimate tokens using ~4 chars per token', () => {
      const manager = new TokenBudgetManager();

      // 40 chars should be ~10 tokens
      expect(manager.estimateTokens('a'.repeat(40))).toBe(10);

      // 100 chars should be 25 tokens
      expect(manager.estimateTokens('a'.repeat(100))).toBe(25);

      // Empty string should be 0 tokens
      expect(manager.estimateTokens('')).toBe(0);
    });

    it('should round up token estimates', () => {
      const manager = new TokenBudgetManager();

      // 5 chars should round up to 2 tokens
      expect(manager.estimateTokens('hello')).toBe(2);

      // 7 chars should round up to 2 tokens
      expect(manager.estimateTokens('hello!!')).toBe(2);
    });
  });

  describe('trimToFit', () => {
    it('should return slices unchanged if within budget', () => {
      const manager = new TokenBudgetManager(1000);
      const projectState = createProjectState({
        'src/App.tsx': 'export function App() { return <div />; }',
      });
      const chunkIndex = buildChunkIndex(projectState);

      const slices: CodeSlice[] = [
        { filePath: 'src/App.tsx', content: 'short content', relevance: 'primary' },
      ];

      const result = manager.trimToFit(slices, chunkIndex);

      expect(result).toEqual(slices);
    });

    it('should return empty array for empty input', () => {
      const manager = new TokenBudgetManager(1000);
      const chunkIndex: ChunkIndex = {
        chunks: new Map(),
        chunksByFile: new Map(),
        fileMetadata: new Map(),
      };

      const result = manager.trimToFit([], chunkIndex);

      expect(result).toEqual([]);
    });

    it('should always keep at least one primary chunk in full', () => {
      // Very small budget
      const manager = new TokenBudgetManager(50);
      const projectState = createProjectState({
        'src/App.tsx': 'export function App() { return <div>Hello World</div>; }',
      });
      const chunkIndex = buildChunkIndex(projectState);

      const slices: CodeSlice[] = [
        {
          filePath: 'src/App.tsx',
          content: 'export function App() { return <div>Hello World</div>; }',
          relevance: 'primary',
        },
      ];

      const result = manager.trimToFit(slices, chunkIndex);

      // Should still have at least one primary slice
      const primarySlices = result.filter((s) => s.relevance === 'primary');
      expect(primarySlices.length).toBeGreaterThanOrEqual(1);
    });

    it('should convert primary slices to outlines when over budget', () => {
      // Small budget that can't fit all primary content
      const manager = new TokenBudgetManager(200);

      const longContent = `export function LongFunction() {
  const a = 1;
  const b = 2;
  const c = 3;
  const d = 4;
  const e = 5;
  return a + b + c + d + e;
}`;

      const projectState = createProjectState({
        'src/utils.ts': longContent,
        'src/App.tsx': 'export function App() { return <div />; }',
      });
      const chunkIndex = buildChunkIndex(projectState);

      const slices: CodeSlice[] = [
        { filePath: 'src/App.tsx', content: 'export function App() { return <div />; }', relevance: 'primary' },
        { filePath: 'src/utils.ts', content: longContent, relevance: 'primary' },
      ];

      const result = manager.trimToFit(slices, chunkIndex);

      // Total tokens should be within budget
      const totalTokens = result.reduce(
        (sum, s) => sum + manager.estimateTokens(s.content),
        0
      );
      expect(totalTokens).toBeLessThanOrEqual(200);
    });

    it('should remove context slices when over budget', () => {
      const manager = new TokenBudgetManager(100);
      const projectState = createProjectState({
        'src/App.tsx': 'export function App() { return <div />; }',
      });
      const chunkIndex = buildChunkIndex(projectState);

      const slices: CodeSlice[] = [
        { filePath: 'src/App.tsx', content: 'export function App() { return <div />; }', relevance: 'primary' },
        { filePath: 'src/types.ts', content: 'a'.repeat(500), relevance: 'context' },
      ];

      const result = manager.trimToFit(slices, chunkIndex);

      // Context slice should be removed if it doesn't fit
      const totalTokens = result.reduce(
        (sum, s) => sum + manager.estimateTokens(s.content),
        0
      );
      expect(totalTokens).toBeLessThanOrEqual(100);
    });

    it('should prioritize keeping smaller primary slices in full', () => {
      const manager = new TokenBudgetManager(100);

      const smallContent = 'export const x = 1;';
      const largeContent = 'export function big() {\n' + '  const x = 1;\n'.repeat(20) + '}';

      const projectState = createProjectState({
        'src/small.ts': smallContent,
        'src/large.ts': largeContent,
      });
      const chunkIndex = buildChunkIndex(projectState);

      const slices: CodeSlice[] = [
        { filePath: 'src/large.ts', content: largeContent, relevance: 'primary' },
        { filePath: 'src/small.ts', content: smallContent, relevance: 'primary' },
      ];

      const result = manager.trimToFit(slices, chunkIndex);

      // The smaller file should remain as primary with full content
      const smallSlice = result.find((s) => s.filePath === 'src/small.ts');
      expect(smallSlice).toBeDefined();
      expect(smallSlice?.content).toBe(smallContent);
    });
  });

  describe('createTokenBudgetManager', () => {
    it('should create a TokenBudgetManager with default budget', () => {
      const manager = createTokenBudgetManager();
      expect(manager).toBeInstanceOf(TokenBudgetManager);
    });

    it('should create a TokenBudgetManager with custom budget', () => {
      const manager = createTokenBudgetManager(2000);
      expect(manager).toBeInstanceOf(TokenBudgetManager);
    });
  });
});
