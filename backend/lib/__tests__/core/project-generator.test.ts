/**
 * @fileoverview Tests for project-generator module
 * Tests project generation from natural language descriptions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProjectGenerator } from '../../core/project-generator';
import type { AIProvider } from '../../ai';
import type { ProjectState, Version } from '@ai-app-builder/shared';

// Mock validateProjectStructure to skip structural checks (generated files may not have package.json)
vi.mock('../../core/validators', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    validateProjectStructure: vi.fn().mockReturnValue([]),
  };
});

// Prevent WorkerPool from spawning real Prettier worker threads in unit tests.
vi.mock('../../core/file-processor', () => ({
  processFiles: vi.fn(async (files: Array<{ path: string; content: string }>) => ({
    files: Object.fromEntries(files.map(f => [f.path, f.content])),
    warnings: [],
  })),
  processFile: vi.fn(async (file: { path: string; content: string }) => file),
}));


describe('ProjectGenerator', () => {
  let mockAIProvider: AIProvider;
  let mockBugfixProvider: AIProvider;
  let mockPromptProvider: any;
  let generator: ProjectGenerator;

  beforeEach(() => {
    // Create a mock AI provider (execution)
    mockAIProvider = {
      generate: vi.fn(),
    } as unknown as AIProvider;

    // Create a mock bugfix provider
    mockBugfixProvider = {
      generate: vi.fn(),
    } as unknown as AIProvider;

    // Create a mock prompt provider
    mockPromptProvider = {
      getIntentSystemPrompt: vi.fn().mockReturnValue('intent prompt'),
      getPlanningSystemPrompt: vi.fn().mockReturnValue('planning prompt'),
      getExecutionGenerationSystemPrompt: vi.fn().mockReturnValue('generation prompt'),
      getExecutionModificationSystemPrompt: vi.fn().mockReturnValue('modification prompt'),
      getReviewSystemPrompt: vi.fn().mockReturnValue('review prompt'),
      getBugfixSystemPrompt: vi.fn().mockReturnValue('bugfix prompt'),
      tokenBudgets: {
        intent: 512,
        planning: 4096,
        executionGeneration: 32768,
        executionModification: 16384,
        review: 32768,
        bugfix: 16384,
      },
    };

    generator = new ProjectGenerator(mockAIProvider, mockBugfixProvider, mockPromptProvider);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generateProject', () => {
    it('should return error for empty description', async () => {
      const result = await generator.generateProject('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Project description is required');
      expect(mockAIProvider.generate).not.toHaveBeenCalled();
    });

    it('should return error for whitespace-only description', async () => {
      const result = await generator.generateProject('   ');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Project description is required');
      expect(mockAIProvider.generate).not.toHaveBeenCalled();
    });

    it('should return error when AI provider fails', async () => {
      vi.mocked(mockAIProvider.generate).mockResolvedValue({
        success: false,
        error: 'AI provider error',
        content: undefined,
        retryCount: 0,
      });

      const result = await generator.generateProject('Create a simple app');

      expect(result.success).toBe(false);
      expect(result.error).toBe('AI provider error');
      expect(mockAIProvider.generate).toHaveBeenCalledTimes(1);
    });

    it('should return error when AI response is invalid JSON', async () => {
      vi.mocked(mockAIProvider.generate).mockResolvedValue({
        success: true,
        content: 'not valid json',
        error: undefined,
        retryCount: 0,
      });

      const result = await generator.generateProject('Create a simple app');

      expect(result.success).toBe(false);
      expect(result.error).toContain('parse failed');
      expect(mockAIProvider.generate).toHaveBeenCalledTimes(1);
    });

    it('should return error for unsafe file paths', async () => {
      const unsafeResponse = JSON.stringify({
        files: [
          {
            path: '../../../etc/passwd',
            content: 'malicious content',
          },
        ],
      });

      vi.mocked(mockAIProvider.generate).mockResolvedValue({
        success: true,
        content: unsafeResponse,
        error: undefined,
        retryCount: 0,
      });

      const result = await generator.generateProject('Create a simple app');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsafe file path detected');
    });

    it('should generate project with valid response', async () => {
      const validResponse = JSON.stringify({
        files: [
          {
            path: 'src/index.ts',
            content: 'console.log("Hello, World!");',
          },
          {
            path: 'package.json',
            content: '{"name": "test-app"}',
          },
        ],
      });

      vi.mocked(mockAIProvider.generate).mockResolvedValue({
        success: true,
        content: validResponse,
        error: undefined,
        retryCount: 0,
      });

      const result = await generator.generateProject('Create a simple app');

      expect(result.success).toBe(true);
      expect(result.projectState).toBeDefined();
      expect(result.version).toBeDefined();
      expect(result.projectState?.files).toBeDefined();
      expect(Object.keys(result.projectState?.files || {})).toContain('src/index.ts');
      expect(Object.keys(result.projectState?.files || {})).toContain('package.json');
    });

    it('should create project with proper metadata', async () => {
      const validResponse = JSON.stringify({
        files: [
          {
            path: 'src/index.ts',
            content: 'console.log("Hello, World!");',
          },
        ],
      });

      vi.mocked(mockAIProvider.generate).mockResolvedValue({
        success: true,
        content: validResponse,
        error: undefined,
        retryCount: 0,
      });

      const description = 'Create a simple app';
      const result = await generator.generateProject(description);

      expect(result.success).toBe(true);
      expect(result.projectState).toBeDefined();
      expect(result.projectState?.id).toBeDefined();
      expect(result.projectState?.name).toBeDefined();
      expect(result.projectState?.description).toBe(description);
      expect(result.projectState?.createdAt).toBeInstanceOf(Date);
      expect(result.projectState?.updatedAt).toBeInstanceOf(Date);
      expect(result.projectState?.currentVersionId).toBeDefined();
    });

    it('should create version with proper metadata', async () => {
      const validResponse = JSON.stringify({
        files: [
          {
            path: 'src/index.ts',
            content: 'console.log("Hello, World!");',
          },
        ],
      });

      vi.mocked(mockAIProvider.generate).mockResolvedValue({
        success: true,
        content: validResponse,
        error: undefined,
        retryCount: 0,
      });

      const description = 'Create a simple app';
      const result = await generator.generateProject(description);

      expect(result.success).toBe(true);
      expect(result.version).toBeDefined();
      expect(result.version?.id).toBeDefined();
      expect(result.version?.projectId).toBe(result.projectState?.id);
      expect(result.version?.prompt).toBe(description);
      expect(result.version?.timestamp).toBeInstanceOf(Date);
      expect(result.version?.parentVersionId).toBeNull();
    });

    it('should handle AI provider with retry count', async () => {
      const validResponse = JSON.stringify({
        files: [
          {
            path: 'src/index.ts',
            content: 'console.log("Hello, World!");',
          },
        ],
      });

      vi.mocked(mockAIProvider.generate).mockResolvedValue({
        success: true,
        content: validResponse,
        error: undefined,
        retryCount: 2,
      });

      const result = await generator.generateProject('Create a simple app');

      expect(result.success).toBe(true);
      expect(mockAIProvider.generate).toHaveBeenCalledTimes(1);
    });

    it('should extract project name from description', async () => {
      const validResponse = JSON.stringify({
        files: [
          {
            path: 'src/index.ts',
            content: 'console.log("Hello, World!");',
          },
        ],
      });

      vi.mocked(mockAIProvider.generate).mockResolvedValue({
        success: true,
        content: validResponse,
        error: undefined,
        retryCount: 0,
      });

      const description = 'Create a todo app with React';
      const result = await generator.generateProject(description);

      expect(result.success).toBe(true);
      expect(result.projectState?.name).toBeDefined();
      expect(result.projectState?.name.split(' ')).toHaveLength(3);
      expect(result.projectState?.name).toContain('Task');
    });

    it('should handle project with multiple files', async () => {
      const validResponse = JSON.stringify({
        files: [
          {
            path: 'src/index.ts',
            content: 'console.log("Hello, World!");',
          },
          {
            path: 'src/utils.ts',
            content: 'export function helper() {}',
          },
          {
            path: 'package.json',
            content: '{"name": "test-app"}',
          },
          {
            path: 'README.md',
            content: '# Test App',
          },
        ],
      });

      vi.mocked(mockAIProvider.generate).mockResolvedValue({
        success: true,
        content: validResponse,
        error: undefined,
        retryCount: 0,
      });

      const result = await generator.generateProject('Create a multi-file app');

      expect(result.success).toBe(true);
      expect(result.projectState?.files).toBeDefined();
      expect(Object.keys(result.projectState?.files || {})).toHaveLength(4);
    });

    it('should handle project with nested directory structure', async () => {
      const validResponse = JSON.stringify({
        files: [
          {
            path: 'src/components/Button.tsx',
            content: 'export const Button = () => <button>Click</button>;',
          },
          {
            path: 'src/utils/helpers.ts',
            content: 'export function helper() {}',
          },
          {
            path: 'src/index.ts',
            content: 'import { Button } from "./components/Button";',
          },
        ],
      });

      vi.mocked(mockAIProvider.generate).mockResolvedValue({
        success: true,
        content: validResponse,
        error: undefined,
        retryCount: 0,
      });

      const result = await generator.generateProject('Create a React app');

      expect(result.success).toBe(true);
      expect(result.projectState?.files).toBeDefined();
      expect(Object.keys(result.projectState?.files || {})).toContain('src/components/Button.tsx');
      expect(Object.keys(result.projectState?.files || {})).toContain('src/utils/helpers.ts');
    });

    it('should handle empty files array', async () => {
      const validResponse = JSON.stringify({
        files: [],
      });

      vi.mocked(mockAIProvider.generate).mockResolvedValue({
        success: true,
        content: validResponse,
        error: undefined,
        retryCount: 0,
      });

      const result = await generator.generateProject('Create an empty project');

      expect(result.success).toBe(true);
      expect(result.projectState?.files).toBeDefined();
      expect(Object.keys(result.projectState?.files || {})).toHaveLength(0);
    });

    it('should handle files with special characters in content', async () => {
      const validResponse = JSON.stringify({
        files: [
          {
            path: 'src/index.ts',
            content: 'const text = "Special chars: <>&\\n\\t";',
          },
        ],
      });

      vi.mocked(mockAIProvider.generate).mockResolvedValue({
        success: true,
        content: validResponse,
        error: undefined,
        retryCount: 0,
      });

      const result = await generator.generateProject('Create an app with special chars');

      expect(result.success).toBe(true);
      expect(result.projectState?.files).toBeDefined();
      expect(result.projectState?.files['src/index.ts']).toContain('Special chars');
    });

    it('should handle long descriptions', async () => {
      const longDescription = 'Create a comprehensive application with the following features: user authentication, real-time updates, drag and drop functionality, dark mode support, responsive design, local storage persistence, internationalization support, accessibility features, performance optimization, and comprehensive error handling.';

      const validResponse = JSON.stringify({
        files: [
          {
            path: 'src/index.ts',
            content: 'console.log("Hello, World!");',
          },
        ],
      });

      vi.mocked(mockAIProvider.generate).mockResolvedValue({
        success: true,
        content: validResponse,
        error: undefined,
        retryCount: 0,
      });

      const result = await generator.generateProject(longDescription);

      expect(result.success).toBe(true);
      expect(result.projectState?.description).toBe(longDescription);
    });

    it('should handle AI response with extra fields', async () => {
      const responseWithExtraFields = JSON.stringify({
        files: [
          {
            path: 'src/index.ts',
            content: 'console.log("Hello, World!");',
          },
        ],
        extraField: 'should be ignored',
        metadata: {
          version: '1.0.0',
          author: 'test',
        },
      });

      vi.mocked(mockAIProvider.generate).mockResolvedValue({
        success: true,
        content: responseWithExtraFields,
        error: undefined,
        retryCount: 0,
      });

      const result = await generator.generateProject('Create a simple app');

      expect(result.success).toBe(true);
      expect(result.projectState?.files).toBeDefined();
    });

    it('should handle files with various extensions', async () => {
      const validResponse = JSON.stringify({
        files: [
          {
            path: 'src/index.ts',
            content: 'console.log("Hello");',
          },
          {
            path: 'styles.css',
            content: 'body { margin: 0; }',
          },
          {
            path: 'config.json',
            content: '{"key": "value"}',
          },
          {
            path: 'README.md',
            content: '# Project',
          },
        ],
      });

      vi.mocked(mockAIProvider.generate).mockResolvedValue({
        success: true,
        content: validResponse,
        error: undefined,
        retryCount: 0,
      });

      const result = await generator.generateProject('Create a multi-language project');

      expect(result.success).toBe(true);
      expect(result.projectState?.files).toBeDefined();
      expect(Object.keys(result.projectState?.files || {})).toContain('src/index.ts');
      expect(Object.keys(result.projectState?.files || {})).toContain('styles.css');
      expect(Object.keys(result.projectState?.files || {})).toContain('config.json');
      expect(Object.keys(result.projectState?.files || {})).toContain('README.md');
    });

    it('should generate unique project and version IDs', async () => {
      const validResponse = JSON.stringify({
        files: [
          {
            path: 'src/index.ts',
            content: 'console.log("Hello, World!");',
          },
        ],
      });

      vi.mocked(mockAIProvider.generate).mockResolvedValue({
        success: true,
        content: validResponse,
        error: undefined,
        retryCount: 0,
      });

      const result1 = await generator.generateProject('Create app 1');
      const result2 = await generator.generateProject('Create app 2');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.projectState?.id).not.toBe(result2.projectState?.id);
      expect(result1.version?.id).not.toBe(result2.version?.id);
    });

    it('should handle project with TypeScript interfaces', async () => {
      const validResponse = JSON.stringify({
        files: [
          {
            path: 'src/types.ts',
            content: 'export interface User { id: number; name: string; }',
          },
          {
            path: 'src/index.ts',
            content: 'import { User } from "./types";',
          },
        ],
      });

      vi.mocked(mockAIProvider.generate).mockResolvedValue({
        success: true,
        content: validResponse,
        error: undefined,
        retryCount: 0,
      });

      const result = await generator.generateProject('Create a TypeScript app');

      expect(result.success).toBe(true);
      expect(result.projectState?.files).toBeDefined();
      expect(result.projectState?.files['src/types.ts']).toContain('interface User');
    });
  });

  describe('Error handling', () => {
    it('should handle AI provider throwing errors', async () => {
      vi.mocked(mockAIProvider.generate).mockRejectedValue(new Error('Network error'));

      await expect(generator.generateProject('Create a simple app')).rejects.toThrow('Network error');
    });

    it('should handle malformed JSON in AI response', async () => {
      vi.mocked(mockAIProvider.generate).mockResolvedValue({
        success: true,
        content: '{invalid json',
        error: undefined,
        retryCount: 0,
      });

      const result = await generator.generateProject('Create a simple app');

      expect(result.success).toBe(false);
      expect(result.error).toContain('parse failed');
    });

    it('should handle AI response with missing files field', async () => {
      const responseWithoutFiles = JSON.stringify({
        name: 'test-app',
      });

      vi.mocked(mockAIProvider.generate).mockResolvedValue({
        success: true,
        content: responseWithoutFiles,
        error: undefined,
        retryCount: 0,
      });

      const result = await generator.generateProject('Create a simple app');

      expect(result.success).toBe(false);
    });
  });
});
