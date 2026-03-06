/**
 * Tests for file-processor module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processFile, processFiles, type ProcessedFile, type ProcessFilesResult } from '../file-processor';

// Mock the WorkerPool
vi.mock('../worker-pool', () => ({
  WorkerPool: vi.fn().mockImplementation(() => ({
    runTask: vi.fn(),
    terminate: vi.fn(),
  })),
}));

// Mock the logger
vi.mock('../../logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('processFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('path sanitization', () => {
    it('should remove spaces from file paths', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockResolvedValue('formatted content');

      const result = await processFile('src/ components/ App.tsx', 'content');
      expect(result.path).toBe('src/components/App.tsx');
    });

    it('should handle multiple spaces', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockResolvedValue('formatted content');

      const result = await processFile('src/  components/  App.tsx', 'content');
      expect(result.path).toBe('src/components/App.tsx');
    });

    it('should add frontend prefix when option is enabled', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockResolvedValue('formatted content');

      const result = await processFile('src/App.tsx', 'content', { addFrontendPrefix: true });
      expect(result.path).toBe('frontend/src/App.tsx');
    });

    it('should not add frontend prefix when path already has it', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockResolvedValue('formatted content');

      const result = await processFile('frontend/src/App.tsx', 'content', { addFrontendPrefix: true });
      expect(result.path).toBe('frontend/src/App.tsx');
    });

    it('should not add frontend prefix when option is disabled', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockResolvedValue('formatted content');

      const result = await processFile('src/App.tsx', 'content', { addFrontendPrefix: false });
      expect(result.path).toBe('src/App.tsx');
    });
  });

  describe('content normalization', () => {
    it('should convert \\n to actual newlines', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const result = await processFile('test.ts', 'line1\\nline2\\nline3');
      expect(result.content).toBe('line1\nline2\nline3');
    });

    it('should convert \\t to actual tabs', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const result = await processFile('test.ts', 'line1\\tline2');
      expect(result.content).toBe('line1\tline2');
    });

    it('should handle both \\n and \\t together', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const result = await processFile('test.ts', 'line1\\n\\tline2');
      expect(result.content).toBe('line1\n\tline2');
    });

    it('should fix literal newlines in single-quoted strings', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const result = await processFile('test.ts', "split('\n')");
      expect(result.content).toBe("split('\\n')");
    });

    it('should fix literal newlines in double-quoted strings', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const result = await processFile('test.ts', 'split("\n")');
      expect(result.content).toBe('split("\\n")');
    });

    it('should fix literal CRLF in strings', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const result = await processFile('test.ts', "split('\\r\\n')");
      expect(result.content).toBe("split('\\r\\n')");
    });

    it('should handle double-escaped sequences from JSON', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const result = await processFile('test.ts', 'line1\\\\nline2');
      expect(result.content).toBe('line1\\nline2');
    });

    it('should handle double-escaped tabs', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const result = await processFile('test.ts', 'line1\\\\tline2');
      expect(result.content).toBe('line1\\tline2');
    });
  });

  describe('package.json version pinning', () => {
    it('should pin "latest" versions for known packages', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const packageJson = JSON.stringify({
        dependencies: {
          react: 'latest',
          'react-dom': 'latest',
        },
      });

      const result = await processFile('package.json', packageJson);
      const parsed = JSON.parse(result.content);
      
      expect(parsed.dependencies.react).toBe('^18.2.0');
      expect(parsed.dependencies['react-dom']).toBe('^18.2.0');
    });

    it('should pin empty versions for known packages', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const packageJson = JSON.stringify({
        dependencies: {
          react: '',
          'react-dom': '',
        },
      });

      const result = await processFile('package.json', packageJson);
      const parsed = JSON.parse(result.content);
      
      expect(parsed.dependencies.react).toBe('^18.2.0');
      expect(parsed.dependencies['react-dom']).toBe('^18.2.0');
    });

    it('should pin "*" versions for known packages', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const packageJson = JSON.stringify({
        dependencies: {
          react: '*',
          'react-dom': '*',
        },
      });

      const result = await processFile('package.json', packageJson);
      const parsed = JSON.parse(result.content);
      
      expect(parsed.dependencies.react).toBe('^18.2.0');
      expect(parsed.dependencies['react-dom']).toBe('^18.2.0');
    });

    it('should pin versions in devDependencies', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const packageJson = JSON.stringify({
        devDependencies: {
          typescript: 'latest',
        },
      });

      const result = await processFile('package.json', packageJson);
      const parsed = JSON.parse(result.content);
      
      expect(parsed.devDependencies.typescript).toBe('^5.4.3');
    });

    it('should pin versions in peerDependencies', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const packageJson = JSON.stringify({
        peerDependencies: {
          react: 'latest',
        },
      });

      const result = await processFile('package.json', packageJson);
      const parsed = JSON.parse(result.content);
      
      expect(parsed.peerDependencies.react).toBe('^18.2.0');
    });

    it('should not pin versions for unknown packages', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const packageJson = JSON.stringify({
        dependencies: {
          'unknown-package': 'latest',
        },
      });

      const result = await processFile('package.json', packageJson);
      const parsed = JSON.parse(result.content);
      
      expect(parsed.dependencies['unknown-package']).toBe('latest');
    });

    it('should not pin valid semver versions', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const packageJson = JSON.stringify({
        dependencies: {
          react: '^18.0.0',
          'react-dom': '18.2.0',
        },
      });

      const result = await processFile('package.json', packageJson);
      const parsed = JSON.parse(result.content);
      
      expect(parsed.dependencies.react).toBe('^18.0.0');
      expect(parsed.dependencies['react-dom']).toBe('18.2.0');
    });

    it('should handle invalid JSON gracefully', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const invalidJson = '{ invalid json }';
      const result = await processFile('package.json', invalidJson);
      
      expect(result.content).toBe(invalidJson);
    });

    it('should only process package.json files', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const packageJson = JSON.stringify({
        dependencies: {
          react: 'latest',
        },
      });

      const result = await processFile('other.json', packageJson);
      const parsed = JSON.parse(result.content);
      
      expect(parsed.dependencies.react).toBe('latest');
    });
  });

  describe('prettier formatting', () => {
    it('should format content with prettier', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockResolvedValue('formatted content');

      const result = await processFile('test.ts', 'unformatted content');
      expect(result.content).toBe('formatted content');
    });

    it('should handle prettier errors gracefully', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockRejectedValue(new Error('Prettier error'));

      const result = await processFile('test.ts', 'content');
      expect(result.content).toBe('content');
      expect(result.warning).toBeDefined();
      expect(result.warning?.type).toBe('formatting');
      expect(result.warning?.message).toContain('Failed to format with Prettier');
    });

    it('should return warning when formatting fails', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockRejectedValue(new Error('Syntax error'));

      const result = await processFile('test.ts', 'content');
      expect(result.warning).toEqual({
        message: 'Failed to format with Prettier: Syntax error. Using original content.',
        type: 'formatting',
      });
    });

    it('should not have warning when formatting succeeds', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockResolvedValue('formatted content');

      const result = await processFile('test.ts', 'content');
      expect(result.warning).toBeUndefined();
    });
  });

  describe('complex scenarios', () => {
    it('should handle complete processing pipeline', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const content = "const x = 'hello\\nworld';";
      const result = await processFile('frontend/src/App.tsx', content, { addFrontendPrefix: true });

      expect(result.path).toBe('frontend/src/App.tsx');
      expect(result.content).toBe("const x = 'hello\\nworld';");
    });

    it('should handle package.json with all processing steps', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const packageJson = JSON.stringify({
        dependencies: {
          react: 'latest',
          'unknown-pkg': 'latest',
        },
      });

      const result = await processFile('package.json', packageJson);
      const parsed = JSON.parse(result.content);

      expect(parsed.dependencies.react).toBe('^18.2.0');
      expect(parsed.dependencies['unknown-pkg']).toBe('latest');
    });

    it('should handle file with escaped sequences', async () => {
      const { WorkerPool } = await import('../worker-pool');
      const mockPool = vi.mocked(new (WorkerPool as any)());
      mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

      const content = 'line1\\\\nline2\\\\tline3';
      const result = await processFile('test.ts', content);

      expect(result.content).toBe('line1\\nline2\\tline3');
    });
  });
});

describe('processFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process multiple files in parallel', async () => {
    const { WorkerPool } = await import('../worker-pool');
    const mockPool = vi.mocked(new (WorkerPool as any)());
    mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

    const files = [
      { path: 'file1.ts', content: 'content1' },
      { path: 'file2.ts', content: 'content2' },
      { path: 'file3.ts', content: 'content3' },
    ];

    const result = await processFiles(files);

    expect(result.files['file1.ts']).toBe('content1');
    expect(result.files['file2.ts']).toBe('content2');
    expect(result.files['file3.ts']).toBe('content3');
    expect(result.warnings).toHaveLength(0);
  });

  it('should filter out invalid files', async () => {
    const { WorkerPool } = await import('../worker-pool');
    const mockPool = vi.mocked(new (WorkerPool as any)());
    mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

    const files = [
      { path: 'file1.ts', content: 'content1' },
      { path: '', content: 'content2' },
      { path: 'file3.ts', content: '' },
      { path: 'file4.ts', content: 'content4' },
    ];

    const result = await processFiles(files);

    expect(Object.keys(result.files)).toHaveLength(2);
    expect(result.files['file1.ts']).toBe('content1');
    expect(result.files['file4.ts']).toBe('content4');
  });

  it('should collect warnings from all files', async () => {
    const { WorkerPool } = await import('../worker-pool');
    const mockPool = vi.mocked(new (WorkerPool as any)());
    mockPool.runTask
      .mockResolvedValueOnce('formatted1')
      .mockRejectedValueOnce(new Error('Error 2'))
      .mockResolvedValueOnce('formatted3');

    const files = [
      { path: 'file1.ts', content: 'content1' },
      { path: 'file2.ts', content: 'content2' },
      { path: 'file3.ts', content: 'content3' },
    ];

    const result = await processFiles(files);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].path).toBe('file2.ts');
    expect(result.warnings[0].type).toBe('formatting');
    expect(result.warnings[0].message).toContain('Failed to format with Prettier');
  });

  it('should handle empty file list', async () => {
    const result = await processFiles([]);

    expect(result.files).toEqual({});
    expect(result.warnings).toHaveLength(0);
  });

  it('should apply options to all files', async () => {
    const { WorkerPool } = await import('../worker-pool');
    const mockPool = vi.mocked(new (WorkerPool as any)());
    mockPool.runTask.mockImplementation(async ({ content }: { content: string }) => content);

    const files = [
      { path: 'src/App.tsx', content: 'content1' },
      { path: 'src/index.ts', content: 'content2' },
    ];

    const result = await processFiles(files, { addFrontendPrefix: true });

    expect(result.files['frontend/src/App.tsx']).toBe('content1');
    expect(result.files['frontend/src/index.ts']).toBe('content2');
  });

  it('should handle mix of successful and failed formatting', async () => {
    const { WorkerPool } = await import('../worker-pool');
    const mockPool = vi.mocked(new (WorkerPool as any)());
    mockPool.runTask
      .mockResolvedValueOnce('formatted1')
      .mockRejectedValueOnce(new Error('Error 2'))
      .mockResolvedValueOnce('formatted3')
      .mockRejectedValueOnce(new Error('Error 4'));

    const files = [
      { path: 'file1.ts', content: 'content1' },
      { path: 'file2.ts', content: 'content2' },
      { path: 'file3.ts', content: 'content3' },
      { path: 'file4.ts', content: 'content4' },
    ];

    const result = await processFiles(files);

    expect(result.warnings).toHaveLength(2);
    expect(result.files['file1.ts']).toBe('formatted1');
    expect(result.files['file2.ts']).toBe('content2');
    expect(result.files['file3.ts']).toBe('formatted3');
    expect(result.files['file4.ts']).toBe('content4');
  });

  it('should preserve file order in warnings', async () => {
    const { WorkerPool } = await import('../worker-pool');
    const mockPool = vi.mocked(new (WorkerPool as any)());
    mockPool.runTask
      .mockRejectedValueOnce(new Error('Error 1'))
      .mockRejectedValueOnce(new Error('Error 2'))
      .mockRejectedValueOnce(new Error('Error 3'));

    const files = [
      { path: 'file1.ts', content: 'content1' },
      { path: 'file2.ts', content: 'content2' },
      { path: 'file3.ts', content: 'content3' },
    ];

    const result = await processFiles(files);

    expect(result.warnings).toHaveLength(3);
    expect(result.warnings[0].path).toBe('file1.ts');
    expect(result.warnings[1].path).toBe('file2.ts');
    expect(result.warnings[2].path).toBe('file3.ts');
  });
});
