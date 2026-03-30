/**
 * Tests for Modification Engine Service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModificationEngine } from '../../diff';
import type { ProjectState } from '@ai-app-builder/shared';

vi.mock('../../core/validation-pipeline');
vi.mock('../../core/build-validator');
vi.mock('../../analysis');
vi.mock('../../diff/diagnostic-repair-engine');
vi.mock('../../diff/checkpoint-manager');
vi.mock('../../config', () => ({
  getMaxOutputTokens: vi.fn(() => 16384),
}));
vi.mock('../../core/validators', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    validateProjectStructure: vi.fn().mockReturnValue([]),
  };
});

import { ValidationPipeline } from '../../core/validation-pipeline';
import * as buildValidatorModule from '../../core/build-validator';
import { DiagnosticRepairEngine } from '../../diff/diagnostic-repair-engine';
import { CheckpointManager } from '../../diff/checkpoint-manager';
import { createFilePlanner, TokenBudgetManager } from '../../analysis';

const makePipelineResult = (finalFiles: Array<{ path: string; content: string }>, executorFiles = finalFiles) => ({
  intentOutput: null,
  planOutput: null,
  executorFiles,
  finalFiles,
});

describe('ModificationEngine', () => {
  let mockPipeline: any;
  let mockBugfixProvider: any;
  let mockPromptProvider: any;
  let mockValidationPipeline: any;
  let mockBuildValidator: any;
  let mockFilePlanner: any;
  let mockRepairEngine: any;
  let mockCheckpointManager: any;
  let engine: ModificationEngine;

  const createProjectState = (files: Record<string, string>): ProjectState => ({
    id: 'test-project',
    name: 'Test Project',
    description: 'A test project',
    files,
    createdAt: new Date(),
    updatedAt: new Date(),
    currentVersionId: 'v1',
  });

  beforeEach(() => {
    mockPipeline = {
      runModificationPipeline: vi.fn(),
    };
    mockBugfixProvider = {
      generate: vi.fn(),
      generateStreaming: vi.fn(),
    };
    mockPromptProvider = {
      getBugfixSystemPrompt: vi.fn().mockReturnValue('fix errors'),
      tokenBudgets: {
        bugfix: 8192,
        executionGeneration: 28000,
        executionModification: 28000,
        intent: 512,
        planning: 4096,
        review: 32768,
      },
    };
    mockValidationPipeline = {
      validate: vi.fn().mockReturnValue({ valid: true, sanitizedOutput: {} }),
    };
    mockBuildValidator = {
      validate: vi.fn().mockReturnValue({ valid: true, errors: [] }),
      formatErrorsForAI: vi.fn(),
      validateCrossFileReferences: vi.fn().mockReturnValue([]),
    };
    mockFilePlanner = {
      planWithCategory: vi.fn().mockResolvedValue({ slices: [], category: 'mixed' }),
    };
    mockRepairEngine = {
      repair: vi.fn().mockResolvedValue({
        updatedFiles: {},
        success: true,
        partialSuccess: false,
        rolledBackFiles: [],
        repairLevel: 'deterministic',
        totalAICalls: 0,
      }),
    };
    mockCheckpointManager = {
      capture: vi.fn(),
      rollback: vi.fn().mockReturnValue(null),
      rollbackAll: vi.fn().mockReturnValue({}),
      has: vi.fn().mockReturnValue(false),
    };

    vi.mocked(ValidationPipeline).mockImplementation(function () { return mockValidationPipeline; });
    vi.mocked(buildValidatorModule.createBuildValidator).mockReturnValue(mockBuildValidator);
    vi.mocked(buildValidatorModule.BuildValidator).mockImplementation(function () { return mockBuildValidator; });
    vi.mocked(createFilePlanner).mockReturnValue(mockFilePlanner);
    vi.mocked(DiagnosticRepairEngine).mockImplementation(function () { return mockRepairEngine; });
    vi.mocked(CheckpointManager).mockImplementation(function () { return mockCheckpointManager; });
    // TokenBudgetManager.trimToFit must return an array (not undefined) to avoid slices.length TypeError
    vi.mocked(TokenBudgetManager).mockImplementation(function () {
      return { trimToFit: vi.fn((slices: any[]) => slices) };
    } as any);

    engine = new ModificationEngine(mockPipeline, mockBugfixProvider, mockPromptProvider);
  });

  describe('modifyProject', () => {
    it('should return error for empty prompt', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      const result = await engine.modifyProject(projectState, '');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Modification prompt is required');
    });

    it('should return error for empty project state', async () => {
      const projectState = createProjectState({});

      const result = await engine.modifyProject(projectState, 'Add a button');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Project state with files is required');
    });

    it('should successfully modify a project (modify op)', async () => {
      const originalContent = 'export default function App() { return <div>Hello</div>; }';
      const projectState = createProjectState({ 'src/App.tsx': originalContent });

      const executorFiles = [
        {
          path: 'src/App.tsx',
          content: JSON.stringify({
            operation: 'modify',
            path: 'src/App.tsx',
            edits: [{ search: 'Hello', replace: 'Hello World' }],
          }),
        },
      ];
      const finalFiles = [{ path: 'src/App.tsx', content: originalContent }];

      mockPipeline.runModificationPipeline.mockResolvedValue(makePipelineResult(finalFiles, executorFiles));
      mockValidationPipeline.validate.mockReturnValue({
        valid: true,
        sanitizedOutput: { 'src/App.tsx': originalContent },
      });
      mockRepairEngine.repair.mockResolvedValue({
        updatedFiles: { 'src/App.tsx': originalContent.replace('Hello', 'Hello World') },
        success: true, partialSuccess: false, rolledBackFiles: [], repairLevel: 'deterministic', totalAICalls: 0,
      });

      const result = await engine.modifyProject(projectState, 'Change Hello to Hello World');

      expect(result.success).toBe(true);
      expect(result.projectState).toBeDefined();
      expect(result.version).toBeDefined();
    });

    it('should handle adding new files', async () => {
      const appContent = 'export default function App() { return <div />; }';
      const buttonContent = 'export default function Button() { return <button>Click</button>; }';
      const projectState = createProjectState({ 'src/App.tsx': appContent });

      const finalFiles = [
        { path: 'src/App.tsx', content: appContent },
        { path: 'src/components/Button.tsx', content: buttonContent },
      ];
      mockPipeline.runModificationPipeline.mockResolvedValue(makePipelineResult(finalFiles));
      mockValidationPipeline.validate.mockReturnValue({
        valid: true,
        sanitizedOutput: {
          'src/App.tsx': appContent,
          'src/components/Button.tsx': buttonContent,
        },
      });
      mockRepairEngine.repair.mockResolvedValue({
        updatedFiles: { 'src/components/Button.tsx': buttonContent },
        success: true, partialSuccess: false, rolledBackFiles: [], repairLevel: 'deterministic', totalAICalls: 0,
      });

      const result = await engine.modifyProject(projectState, 'Add a Button component');

      expect(result.success).toBe(true);
      expect(result.projectState?.files['src/components/Button.tsx']).toBeDefined();
      expect(result.changeSummary?.filesAdded).toBe(1);
    });

    it('should handle deleting files', async () => {
      const appContent = 'export default function App() { return <div />; }';
      const projectState = createProjectState({
        'src/App.tsx': appContent,
        'src/OldComponent.tsx': 'export default function OldComponent() { return <div />; }',
      });

      // finalFiles doesn't include OldComponent (deleted)
      const finalFiles = [{ path: 'src/App.tsx', content: appContent }];
      const executorFiles = [
        { path: 'src/OldComponent.tsx', content: JSON.stringify({ operation: 'delete', path: 'src/OldComponent.tsx' }) },
      ];
      mockPipeline.runModificationPipeline.mockResolvedValue(makePipelineResult(finalFiles, executorFiles));
      mockValidationPipeline.validate.mockReturnValue({
        valid: true,
        sanitizedOutput: { 'src/App.tsx': appContent },
      });
      mockRepairEngine.repair.mockResolvedValue({
        updatedFiles: { 'src/OldComponent.tsx': null },
        success: true, partialSuccess: false, rolledBackFiles: [], repairLevel: 'deterministic', totalAICalls: 0,
      });

      const result = await engine.modifyProject(projectState, 'Delete the OldComponent');

      expect(result.success).toBe(true);
      expect(result.projectState?.files['src/OldComponent.tsx']).toBeUndefined();
      expect(result.changeSummary?.filesDeleted).toBe(1);
    });

    it('should handle pipeline failure', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      mockPipeline.runModificationPipeline.mockRejectedValue(new Error('Execution stage failed'));

      const result = await engine.modifyProject(projectState, 'Change something');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Execution stage failed');
    });

    it('should handle validation failure', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      const finalFiles = [{ path: 'src/App.tsx', content: 'export default function App() { return <div />; }' }];
      mockPipeline.runModificationPipeline.mockResolvedValue(makePipelineResult(finalFiles));
      mockValidationPipeline.validate.mockReturnValue({
        valid: false,
        errors: [{ type: 'syntax', message: 'Syntax error' }],
      });

      const result = await engine.modifyProject(projectState, 'Change something');

      expect(result.success).toBe(false);
      expect(result.validationErrors).toBeDefined();
    });

    it('should create new version with correct parent', async () => {
      const appContent = 'export default function App() { return <div />; }';
      const modifiedContent = 'export default function App() { return <div>Modified</div>; }';
      const projectState = createProjectState({ 'src/App.tsx': appContent });

      const finalFiles = [{ path: 'src/App.tsx', content: modifiedContent }];
      mockPipeline.runModificationPipeline.mockResolvedValue(makePipelineResult(finalFiles));
      mockValidationPipeline.validate.mockReturnValue({
        valid: true,
        sanitizedOutput: { 'src/App.tsx': modifiedContent },
      });
      mockRepairEngine.repair.mockResolvedValue({
        updatedFiles: { 'src/App.tsx': modifiedContent },
        success: true, partialSuccess: false, rolledBackFiles: [], repairLevel: 'deterministic', totalAICalls: 0,
      });

      const result = await engine.modifyProject(projectState, 'Modify App');

      expect(result.success).toBe(true);
      expect(result.version?.parentVersionId).toBe('v1');
      expect(result.version?.prompt).toBe('Modify App');
    });

    it('calls onPipelineStage when pipeline emits stage events', async () => {
      const appContent = 'export default function App() { return <div />; }';
      const projectState = createProjectState({ 'src/App.tsx': appContent });

      mockPipeline.runModificationPipeline.mockImplementation(
        async (_prompt: string, _files: any, _slices: any, callbacks: any) => {
          callbacks.onStageStart?.('intent', 'Analyzing intent...');
          callbacks.onStageComplete?.('intent');
          callbacks.onStageFailed?.('planning', 'timeout');
          return makePipelineResult([{ path: 'src/App.tsx', content: appContent }]);
        }
      );
      mockValidationPipeline.validate.mockReturnValue({
        valid: true,
        sanitizedOutput: { 'src/App.tsx': appContent },
      });
      mockRepairEngine.repair.mockResolvedValue({
        updatedFiles: {},
        success: true, partialSuccess: false, rolledBackFiles: [], repairLevel: 'deterministic', totalAICalls: 0,
      });

      const onPipelineStage = vi.fn();
      await engine.modifyProject(projectState, 'test', { onPipelineStage });

      expect(onPipelineStage).toHaveBeenCalledWith({ stage: 'intent', label: 'Analyzing intent...', status: 'start' });
      expect(onPipelineStage).toHaveBeenCalledWith({ stage: 'intent', label: '', status: 'complete' });
      expect(onPipelineStage).toHaveBeenCalledWith({ stage: 'planning', label: 'timeout', status: 'degraded' });
    });
  });

  describe('createModificationEngine factory', () => {
    it('should export createModificationEngine as a function', async () => {
      const { createModificationEngine } = await import('../../diff');
      expect(typeof createModificationEngine).toBe('function');
    });
  });
});
