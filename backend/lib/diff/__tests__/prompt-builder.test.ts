import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addLineNumbers,
  buildModificationPrompt,
  buildBuildFixPrompt,
  buildFailedEditRetryPrompt,
  buildSlicesFromFiles,
  formatConversationContext,
} from '../prompt-builder';
import type { ProjectState, ConversationTurn } from '@ai-app-builder/shared';
import type { CodeSlice } from '../../analysis/file-planner/types';
import type { FailedFileEdit } from '../file-edit-applicator';

describe('addLineNumbers', () => {
  it('should prepend 1-based line numbers to multi-line content', () => {
    const result = addLineNumbers('line one\nline two\nline three');
    expect(result).toBe('1: line one\n2: line two\n3: line three');
  });

  it('should handle empty string', () => {
    const result = addLineNumbers('');
    expect(result).toBe('1: ');
  });

  it('should handle single line', () => {
    const result = addLineNumbers('hello world');
    expect(result).toBe('1: hello world');
  });
});

describe('buildModificationPrompt', () => {
  let mockProjectState: ProjectState;
  let mockSlices: CodeSlice[];

  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectState = {
      id: 'test-project',
      name: 'Test Project',
      description: 'A test project',
      createdAt: new Date(),
      updatedAt: new Date(),
      currentVersionId: 'v1',
      files: {},
    };
    mockSlices = [
      {
        filePath: 'src/index.ts',
        content: 'export const foo = "bar";',
        relevance: 'primary',
      },
      {
        filePath: 'src/utils.ts',
        content: 'export const utils = {};',
        relevance: 'context',
      },
    ];
  });

  describe('happy path', () => {
    it('should build prompt with primary and context slices', () => {
      const userPrompt = 'Add a new feature';
      const result = buildModificationPrompt(userPrompt, mockSlices, mockProjectState);

      expect(result).toContain('User Request: Add a new feature');
      expect(result).toContain('=== PRIMARY FILES (likely need modification) ===');
      expect(result).toContain('--- src/index.ts ---');
      expect(result).toContain('export const foo = "bar";');
      expect(result).toContain('=== CONTEXT FILES (outlines for reference) ===');
      expect(result).toContain('--- src/utils.ts ---');
      // Context files use outlines, not full content
    });

    it('should include line numbers in primary file content', () => {
      const result = buildModificationPrompt('Add a new feature', mockSlices, mockProjectState);
      // Primary files have line-numbered content (format: "N: content")
      expect(result).toContain('1: export const foo = "bar";');
    });

    it('should build prompt with only primary slices', () => {
      const primaryOnlySlices: CodeSlice[] = [
        {
          filePath: 'src/index.ts',
          content: 'export const foo = "bar";',
          relevance: 'primary',
        },
      ];
      const userPrompt = 'Modify index';
      const result = buildModificationPrompt(userPrompt, primaryOnlySlices, mockProjectState);

      expect(result).toContain('=== PRIMARY FILES (likely need modification) ===');
      expect(result).not.toContain('=== CONTEXT FILES (outlines for reference) ===');
    });

    it('should build prompt with only context slices', () => {
      const contextOnlySlices: CodeSlice[] = [
        {
          filePath: 'src/utils.ts',
          content: 'export const utils = {};',
          relevance: 'context',
        },
      ];
      const userPrompt = 'Check utils';
      const result = buildModificationPrompt(userPrompt, contextOnlySlices, mockProjectState);

      expect(result).not.toContain('=== PRIMARY FILES (likely need modification) ===');
      expect(result).toContain('=== CONTEXT FILES (outlines for reference) ===');
    });

    it('should include JSON output instruction', () => {
      const userPrompt = 'Test prompt';
      const result = buildModificationPrompt(userPrompt, mockSlices, mockProjectState);

      expect(result).toContain('Based on the user request, output ONLY the JSON with modified/new files.');
    });
  });

  describe('edge cases', () => {
    it('should handle empty slices array', () => {
      const userPrompt = 'Test prompt';
      const emptySlices: CodeSlice[] = [];
      const result = buildModificationPrompt(userPrompt, emptySlices, mockProjectState);

      expect(result).toContain('User Request: Test prompt');
      expect(result).toContain('Based on the user request, output ONLY the JSON with modified/new files.');
      expect(result).not.toContain('=== PRIMARY FILES');
      expect(result).not.toContain('=== CONTEXT FILES');
    });

    it('should handle empty user prompt', () => {
      const userPrompt = '';
      const result = buildModificationPrompt(userPrompt, mockSlices, mockProjectState);

      expect(result).toContain('User Request: ');
    });

    it('should handle special characters in user prompt', () => {
      const userPrompt = 'Add special chars: <>&"\'';
      const result = buildModificationPrompt(userPrompt, mockSlices, mockProjectState);

      expect(result).toContain('User Request: Add special chars: <>&"\'');
    });

    it('should handle multiple primary slices', () => {
      const multiPrimarySlices: CodeSlice[] = [
        {
          filePath: 'src/index.ts',
          content: 'export const foo = "bar";',
          relevance: 'primary',
        },
        {
          filePath: 'src/app.ts',
          content: 'export const app = "app";',
          relevance: 'primary',
        },
      ];
      const userPrompt = 'Modify both files';
      const result = buildModificationPrompt(userPrompt, multiPrimarySlices, mockProjectState);

      expect(result).toContain('--- src/index.ts ---');
      expect(result).toContain('--- src/app.ts ---');
    });
  });

  describe('return value shape', () => {
    it('should return string', () => {
      const userPrompt = 'Test prompt';
      const result = buildModificationPrompt(userPrompt, mockSlices, mockProjectState);

      expect(typeof result).toBe('string');
    });
  });

  describe('side effects', () => {
    it('should not mutate input slices', () => {
      const userPrompt = 'Test prompt';
      const originalSlices = JSON.parse(JSON.stringify(mockSlices));

      buildModificationPrompt(userPrompt, mockSlices, mockProjectState);

      expect(mockSlices).toEqual(originalSlices);
    });
  });
});

describe('buildBuildFixPrompt', () => {
  let mockAllFiles: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAllFiles = {
      'src/index.ts': 'import { utils } from "./utils";\nexport const foo = "bar";',
      'src/utils.ts': 'export const utils = {};',
      'package.json': '{"name":"test","dependencies":{}}',
    };
  });

  describe('happy path', () => {
    it('should build prompt with error files', () => {
      const errorFiles = new Set(['src/index.ts']);
      const userPrompt = 'Fix build errors';
      const result = buildBuildFixPrompt(userPrompt, errorFiles, mockAllFiles);

      expect(result).toContain('User Request: Fix build errors');
      expect(result).toContain('=== FILES WITH BUILD ERRORS (current content) ===');
      expect(result).toContain('--- src/index.ts ---');
      expect(result).toContain('export const foo = "bar";');
    });

    it('should include package.json if it exists', () => {
      const errorFiles = new Set(['src/index.ts']);
      const userPrompt = 'Fix build errors';
      const result = buildBuildFixPrompt(userPrompt, errorFiles, mockAllFiles);

      expect(result).toContain('=== PACKAGE.JSON ===');
      expect(result).toContain('--- package.json ---');
      expect(result).toContain('{"name":"test","dependencies":{}}');
    });

    it('should include dependent files', () => {
      const errorFiles = new Set(['src/utils.ts']);
      const userPrompt = 'Fix build errors';
      const result = buildBuildFixPrompt(userPrompt, errorFiles, mockAllFiles);

      expect(result).toContain('=== DEPENDENT FILES (import error files — may need updates) ===');
      expect(result).toContain('--- src/index.ts ---');
    });

    it('should include JSON output instruction', () => {
      const errorFiles = new Set(['src/index.ts']);
      const userPrompt = 'Fix build errors';
      const result = buildBuildFixPrompt(userPrompt, errorFiles, mockAllFiles);

      expect(result).toContain('Based on the user request, output ONLY the JSON with modified/new files.');
    });
  });

  describe('edge cases', () => {
    it('should handle empty error files set', () => {
      const errorFiles = new Set<string>();
      const userPrompt = 'Fix build errors';
      const result = buildBuildFixPrompt(userPrompt, errorFiles, mockAllFiles);

      expect(result).toContain('User Request: Fix build errors');
      expect(result).toContain('Based on the user request, output ONLY the JSON with modified/new files.');
      expect(result).not.toContain('=== FILES WITH BUILD ERRORS');
    });

    it('should handle missing package.json', () => {
      const filesWithoutPackage = {
        'src/index.ts': 'export const foo = "bar";',
        'src/utils.ts': 'export const utils = {};',
      };
      const errorFiles = new Set(['src/index.ts']);
      const userPrompt = 'Fix build errors';
      const result = buildBuildFixPrompt(userPrompt, errorFiles, filesWithoutPackage);

      expect(result).not.toContain('=== PACKAGE.JSON ===');
    });

    it('should handle empty allFiles object', () => {
      const errorFiles = new Set(['src/index.ts']);
      const emptyFiles: Record<string, string> = {};
      const userPrompt = 'Fix build errors';
      const result = buildBuildFixPrompt(userPrompt, errorFiles, emptyFiles);

      expect(result).toContain('User Request: Fix build errors');
      expect(result).toContain('Based on the user request, output ONLY the JSON with modified/new files.');
    });
  });

  describe('return value shape', () => {
    it('should return string', () => {
      const errorFiles = new Set(['src/index.ts']);
      const userPrompt = 'Fix build errors';
      const result = buildBuildFixPrompt(userPrompt, errorFiles, mockAllFiles);

      expect(typeof result).toBe('string');
    });
  });

  describe('side effects', () => {
    it('should not mutate input error files set', () => {
      const errorFiles = new Set(['src/index.ts']);
      const userPrompt = 'Fix build errors';
      const errorFilesCopy = new Set(errorFiles);

      buildBuildFixPrompt(userPrompt, errorFiles, mockAllFiles);

      expect(errorFiles).toEqual(errorFilesCopy);
    });

    it('should not mutate input allFiles object', () => {
      const errorFiles = new Set(['src/index.ts']);
      const userPrompt = 'Fix build errors';
      const allFilesCopy = { ...mockAllFiles };

      buildBuildFixPrompt(userPrompt, errorFiles, mockAllFiles);

      expect(mockAllFiles).toEqual(allFilesCopy);
    });
  });
});

describe('buildFailedEditRetryPrompt', () => {
  it('should include line numbers in current file content', () => {
    const failedEdits: FailedFileEdit[] = [
      {
        path: 'src/index.ts',
        originalContent: 'line one\nline two\nline three',
        failedEdits: [
          {
            editIndex: 0,
            error: 'Search string not found',
            edit: { search: 'missing text', replace: 'new text' },
          },
        ],
      },
    ];

    const result = buildFailedEditRetryPrompt('Fix the issue', failedEdits);

    expect(result).toContain('1: line one');
    expect(result).toContain('2: line two');
    expect(result).toContain('3: line three');
  });
});

describe('buildSlicesFromFiles', () => {
  let mockProjectState: ProjectState;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectState = {
      id: 'test-project',
      name: 'Test Project',
      description: 'A test project',
      createdAt: new Date(),
      updatedAt: new Date(),
      currentVersionId: 'v1',
      files: {
        'src/index.ts': 'export const foo = "bar";',
        'src/utils.ts': 'export const utils = {};',
        'package.json': '{"name":"test"}',
      },
    };
  });

  describe('happy path', () => {
    it('should build slices from all project files', () => {
      const result = buildSlicesFromFiles(mockProjectState);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        filePath: 'src/index.ts',
        content: 'export const foo = "bar";',
        relevance: 'primary',
      });
      expect(result[1]).toEqual({
        filePath: 'src/utils.ts',
        content: 'export const utils = {};',
        relevance: 'primary',
      });
      expect(result[2]).toEqual({
        filePath: 'package.json',
        content: '{"name":"test"}',
        relevance: 'primary',
      });
    });

    it('should mark all slices as primary relevance', () => {
      const result = buildSlicesFromFiles(mockProjectState);

      for (const slice of result) {
        expect(slice.relevance).toBe('primary');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty project files', () => {
      const emptyProject: ProjectState = {
        ...mockProjectState,
        files: {},
      };
      const result = buildSlicesFromFiles(emptyProject);

      expect(result).toHaveLength(0);
    });

    it('should handle single file project', () => {
      const singleFileProject: ProjectState = {
        ...mockProjectState,
        files: {
          'src/index.ts': 'export const foo = "bar";',
        },
      };
      const result = buildSlicesFromFiles(singleFileProject);

      expect(result).toHaveLength(1);
      expect(result[0].filePath).toBe('src/index.ts');
    });

    it('should handle files with special characters in content', () => {
      const specialContentProject: ProjectState = {
        ...mockProjectState,
        files: {
          'src/special.ts': 'export const special = "特殊\\n\\tchars";',
        },
      };
      const result = buildSlicesFromFiles(specialContentProject);

      expect(result[0].content).toBe('export const special = "特殊\\n\\tchars";');
    });
  });

  describe('return value shape', () => {
    it('should return array of CodeSlice objects', () => {
      const result = buildSlicesFromFiles(mockProjectState);

      expect(Array.isArray(result)).toBe(true);
      for (const slice of result) {
        expect(slice).toHaveProperty('filePath');
        expect(slice).toHaveProperty('content');
        expect(slice).toHaveProperty('relevance');
      }
    });

    it('should have string filePath and content', () => {
      const result = buildSlicesFromFiles(mockProjectState);

      for (const slice of result) {
        expect(typeof slice.filePath).toBe('string');
        expect(typeof slice.content).toBe('string');
      }
    });
  });

  describe('side effects', () => {
    it('should not mutate project state', () => {
      const originalFiles = { ...mockProjectState.files };

      buildSlicesFromFiles(mockProjectState);

      expect(mockProjectState.files).toEqual(originalFiles);
    });
  });
});

describe('formatConversationContext', () => {
  it('should return null for undefined history', () => {
    expect(formatConversationContext(undefined)).toBeNull();
  });

  it('should return null for empty history', () => {
    expect(formatConversationContext([])).toBeNull();
  });

  it('should format user and assistant turns', () => {
    const history: ConversationTurn[] = [
      { role: 'user', content: 'Add a button' },
      { role: 'assistant', content: 'Done' },
    ];
    const result = formatConversationContext(history);

    expect(result).toContain('=== CONVERSATION HISTORY (recent turns) ===');
    expect(result).toContain('User: Add a button');
    expect(result).toContain('Assistant: Done');
  });

  it('should include changeSummary description and files when present', () => {
    const history: ConversationTurn[] = [
      {
        role: 'assistant',
        content: 'I added the feature',
        changeSummary: { description: 'Added a login form', affectedFiles: ['src/Login.tsx', 'src/App.tsx'] },
      },
    ];
    const result = formatConversationContext(history)!;

    expect(result).toContain('Assistant: Added a login form [files: src/Login.tsx, src/App.tsx]');
  });

  it('should fall back to content when changeSummary has no description or files', () => {
    const history: ConversationTurn[] = [
      {
        role: 'assistant',
        content: 'Some response',
        changeSummary: { description: '', affectedFiles: [] },
      },
    ];
    const result = formatConversationContext(history)!;

    expect(result).toContain('Assistant: Some response');
  });
});
