import { describe, it, expect, vi } from 'vitest';
import {
  buildImportGraph,
  findModifiedAncestors,
  analyzeRootCause,
} from '../root-cause-analyzer';
import type { BuildError } from '../../core/build-validator';
import type { AIProvider } from '../../ai';

// Mock logger
vi.mock('../../logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

function makeError(overrides: Partial<BuildError> = {}): BuildError {
  return {
    type: 'syntax_error',
    message: 'Unexpected token',
    file: 'src/App.tsx',
    severity: 'fixable',
    ...overrides,
  };
}

// ─── buildImportGraph ───────────────────────────────────────────────────────

describe('buildImportGraph', () => {
  it('should build graph from file imports', () => {
    const files = {
      'src/App.tsx': "import { helper } from './utils';",
      'src/utils.ts': 'export const helper = () => {};',
    };

    const graph = buildImportGraph(files);

    expect(graph.get('src/App.tsx')?.has('src/utils.ts')).toBe(true);
    expect(graph.get('src/utils.ts')?.size).toBe(0);
  });

  it('should resolve index files', () => {
    const files = {
      'src/App.tsx': "import { Foo } from './components';",
      'src/components/index.ts': 'export const Foo = 1;',
    };

    const graph = buildImportGraph(files);
    expect(graph.get('src/App.tsx')?.has('src/components/index.ts')).toBe(true);
  });

  it('should handle files with no imports', () => {
    const files = {
      'src/constants.ts': 'export const X = 1;',
    };

    const graph = buildImportGraph(files);
    expect(graph.get('src/constants.ts')?.size).toBe(0);
  });

  it('should skip unresolvable imports', () => {
    const files = {
      'src/App.tsx': "import { something } from './nonexistent';",
    };

    const graph = buildImportGraph(files);
    expect(graph.get('src/App.tsx')?.size).toBe(0);
  });
});

// ─── findModifiedAncestors ──────────────────────────────────────────────────

describe('findModifiedAncestors', () => {
  it('should find single modified ancestor', () => {
    // A imports B, B was modified
    const files = {
      'src/App.tsx': "import { helper } from './utils';",
      'src/utils.ts': 'export const helper = () => {};',
    };
    const graph = buildImportGraph(files);
    const modified = new Set(['src/utils.ts']);

    const ancestors = findModifiedAncestors('src/App.tsx', modified, graph);
    expect(ancestors).toEqual(['src/utils.ts']);
  });

  it('should find multiple modified ancestors', () => {
    // App imports both utils and types, both were modified
    const files = {
      'src/App.tsx': [
        "import { helper } from './utils';",
        "import { MyType } from './types';",
      ].join('\n'),
      'src/utils.ts': 'export const helper = () => {};',
      'src/types.ts': 'export type MyType = string;',
    };
    const graph = buildImportGraph(files);
    const modified = new Set(['src/utils.ts', 'src/types.ts']);

    const ancestors = findModifiedAncestors('src/App.tsx', modified, graph);
    expect(ancestors).toHaveLength(2);
    expect(ancestors).toContain('src/utils.ts');
    expect(ancestors).toContain('src/types.ts');
  });

  it('should find transitive ancestors', () => {
    // App imports Page, Page imports utils (modified)
    const files = {
      'src/App.tsx': "import { Page } from './Page';",
      'src/Page.tsx': "import { helper } from './utils';",
      'src/utils.ts': 'export const helper = () => {};',
    };
    const graph = buildImportGraph(files);
    const modified = new Set(['src/utils.ts']);

    const ancestors = findModifiedAncestors('src/App.tsx', modified, graph);
    expect(ancestors).toEqual(['src/utils.ts']);
  });

  it('should return empty when no ancestors modified', () => {
    const files = {
      'src/App.tsx': "import { helper } from './utils';",
      'src/utils.ts': 'export const helper = () => {};',
    };
    const graph = buildImportGraph(files);
    const modified = new Set<string>();

    const ancestors = findModifiedAncestors('src/App.tsx', modified, graph);
    expect(ancestors).toEqual([]);
  });

  it('should handle cycles without infinite loop', () => {
    // A imports B, B imports A (cycle)
    const files = {
      'src/a.ts': "import { b } from './b';",
      'src/b.ts': "import { a } from './a';",
    };
    const graph = buildImportGraph(files);
    const modified = new Set(['src/b.ts']);

    const ancestors = findModifiedAncestors('src/a.ts', modified, graph);
    expect(ancestors).toEqual(['src/b.ts']);
  });

  it('should not include the error file itself as an ancestor', () => {
    const files = {
      'src/App.tsx': "import { helper } from './utils';",
      'src/utils.ts': 'export const helper = () => {};',
    };
    const graph = buildImportGraph(files);
    // Error file itself is also modified
    const modified = new Set(['src/App.tsx', 'src/utils.ts']);

    const ancestors = findModifiedAncestors('src/App.tsx', modified, graph);
    expect(ancestors).toEqual(['src/utils.ts']);
    expect(ancestors).not.toContain('src/App.tsx');
  });
});

// ─── analyzeRootCause ───────────────────────────────────────────────────────

describe('analyzeRootCause', () => {
  it('should return deterministic result for single ancestor', async () => {
    const files = {
      'src/App.tsx': "import { helper } from './utils';",
      'src/utils.ts': 'export const helper = () => {};',
    };
    const graph = buildImportGraph(files);
    const modified = new Set(['src/utils.ts']);

    const result = await analyzeRootCause(
      makeError({ file: 'src/App.tsx' }),
      modified,
      files,
      graph,
    );

    expect(result.approach).toBe('deterministic');
    expect(result.rootFile).toBe('src/utils.ts');
  });

  it('should call AI for multiple ancestors', async () => {
    const files = {
      'src/App.tsx': [
        "import { a } from './a';",
        "import { b } from './b';",
      ].join('\n'),
      'src/a.ts': 'export const a = 1;',
      'src/b.ts': 'export const b = 2;',
    };
    const graph = buildImportGraph(files);
    const modified = new Set(['src/a.ts', 'src/b.ts']);

    const mockAI: AIProvider = {
      generate: vi.fn().mockResolvedValue({
        success: true,
        content: JSON.stringify({
          rootFile: 'src/a.ts',
          rootCause: 'Change in a.ts broke the import',
        }),
      }),
      generateStreaming: vi.fn(),
    };

    const result = await analyzeRootCause(
      makeError({ file: 'src/App.tsx' }),
      modified,
      files,
      graph,
      mockAI,
    );

    expect(result.approach).toBe('ai-analyzed');
    expect(result.rootFile).toBe('src/a.ts');
    expect(mockAI.generate).toHaveBeenCalledTimes(1);
    // Verify low token budget
    expect(mockAI.generate).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 512 }),
    );
  });

  it('should call AI for zero ancestors', async () => {
    const files = {
      'src/App.tsx': 'const x = 1;',
    };
    const graph = buildImportGraph(files);
    const modified = new Set<string>();

    const mockAI: AIProvider = {
      generate: vi.fn().mockResolvedValue({
        success: true,
        content: JSON.stringify({
          rootFile: 'src/App.tsx',
          rootCause: 'Syntax error in the file itself',
        }),
      }),
      generateStreaming: vi.fn(),
    };

    const result = await analyzeRootCause(
      makeError({ file: 'src/App.tsx' }),
      modified,
      files,
      graph,
      mockAI,
    );

    expect(result.approach).toBe('ai-analyzed');
    expect(mockAI.generate).toHaveBeenCalledTimes(1);
  });

  it('should return unknown when AI returns invalid JSON', async () => {
    const files = {
      'src/App.tsx': "import { a } from './a';",
      'src/a.ts': 'export const a = 1;',
      'src/b.ts': 'export const b = 2;',
    };
    // Need 0 or multiple ancestors to trigger AI
    const graph = buildImportGraph(files);
    const modified = new Set<string>(); // 0 ancestors

    const mockAI: AIProvider = {
      generate: vi.fn().mockResolvedValue({
        success: true,
        content: 'not valid json {{{',
      }),
      generateStreaming: vi.fn(),
    };

    const result = await analyzeRootCause(
      makeError({ file: 'src/App.tsx' }),
      modified,
      files,
      graph,
      mockAI,
    );

    expect(result.approach).toBe('unknown');
    expect(result.rootFile).toBe('src/App.tsx');
  });

  it('should return unknown when AI call fails', async () => {
    const files = { 'src/App.tsx': 'const x = 1;' };
    const graph = buildImportGraph(files);

    const mockAI: AIProvider = {
      generate: vi.fn().mockResolvedValue({
        success: false,
        error: 'API error',
      }),
      generateStreaming: vi.fn(),
    };

    const result = await analyzeRootCause(
      makeError({ file: 'src/App.tsx' }),
      new Set<string>(),
      files,
      graph,
      mockAI,
    );

    expect(result.approach).toBe('unknown');
  });

  it('should return unknown when no AI provider and ambiguous', async () => {
    const files = { 'src/App.tsx': 'const x = 1;' };
    const graph = buildImportGraph(files);

    const result = await analyzeRootCause(
      makeError({ file: 'src/App.tsx' }),
      new Set<string>(),
      files,
      graph,
      // No AI provider
    );

    expect(result.approach).toBe('unknown');
    expect(result.rootFile).toBe('src/App.tsx');
  });

  it('should return unknown when AI response has wrong shape', async () => {
    const files = { 'src/App.tsx': 'const x = 1;' };
    const graph = buildImportGraph(files);

    const mockAI: AIProvider = {
      generate: vi.fn().mockResolvedValue({
        success: true,
        content: JSON.stringify({ wrongField: 'value' }),
      }),
      generateStreaming: vi.fn(),
    };

    const result = await analyzeRootCause(
      makeError({ file: 'src/App.tsx' }),
      new Set<string>(),
      files,
      graph,
      mockAI,
    );

    expect(result.approach).toBe('unknown');
  });
});
