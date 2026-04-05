import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyError,
  hasDeterministicFix,
  DiagnosticRepairEngine,
} from '../diagnostic-repair-engine';
import type { BuildError, BuildValidationResult } from '../../core/build-validator';
import type { ProjectState } from '@ai-app-builder/shared';
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

// Mock config (avoid env var validation)
vi.mock('../../config', () => ({
  getMaxOutputTokens: vi.fn(() => 16384),
}));

function makeError(overrides: Partial<BuildError>): BuildError {
  return {
    type: 'missing_dependency',
    message: 'test error',
    file: 'src/App.tsx',
    severity: 'fixable',
    ...overrides,
  };
}

// ─── Task 2.1: Error Classifier ────────────────────────────────────────────

describe('classifyError', () => {
  it('maps missing_dependency to MISSING_DEPENDENCY', () => {
    expect(classifyError(makeError({ type: 'missing_dependency' }))).toBe('MISSING_DEPENDENCY');
  });

  it('maps broken_import to BROKEN_IMPORT', () => {
    expect(classifyError(makeError({ type: 'broken_import' }))).toBe('BROKEN_IMPORT');
  });

  it('maps missing_file to BROKEN_IMPORT', () => {
    expect(classifyError(makeError({ type: 'missing_file' }))).toBe('BROKEN_IMPORT');
  });

  it('maps import_export_mismatch to EXPORT_MISMATCH', () => {
    expect(classifyError(makeError({ type: 'import_export_mismatch' }))).toBe('EXPORT_MISMATCH');
  });

  it('maps syntax_error to SYNTAX_ERROR', () => {
    expect(classifyError(makeError({ type: 'syntax_error' }))).toBe('SYNTAX_ERROR');
  });

  it('maps directive_error to UNKNOWN', () => {
    expect(classifyError(makeError({ type: 'directive_error' }))).toBe('UNKNOWN');
  });

  it('maps server_client_boundary to UNKNOWN', () => {
    expect(classifyError(makeError({ type: 'server_client_boundary' }))).toBe('UNKNOWN');
  });

  it('maps prisma_error to UNKNOWN', () => {
    expect(classifyError(makeError({ type: 'prisma_error' }))).toBe('UNKNOWN');
  });

  it('maps naming_convention to UNKNOWN', () => {
    expect(classifyError(makeError({ type: 'naming_convention' }))).toBe('UNKNOWN');
  });
});

describe('hasDeterministicFix', () => {
  it('returns true for MISSING_DEPENDENCY', () => {
    expect(hasDeterministicFix('MISSING_DEPENDENCY')).toBe(true);
  });

  it('returns true for BROKEN_IMPORT', () => {
    expect(hasDeterministicFix('BROKEN_IMPORT')).toBe(true);
  });

  it('returns true for EXPORT_MISMATCH', () => {
    expect(hasDeterministicFix('EXPORT_MISMATCH')).toBe(true);
  });

  it('returns true for SYNTAX_ERROR', () => {
    expect(hasDeterministicFix('SYNTAX_ERROR')).toBe(true);
  });

  it('returns false for RUNTIME', () => {
    expect(hasDeterministicFix('RUNTIME')).toBe(false);
  });

  it('returns false for UNKNOWN', () => {
    expect(hasDeterministicFix('UNKNOWN')).toBe(false);
  });
});

// ─── Task 2.2: Batched Repair Engine ───────────────────────────────────────

// Helper to build AcceptanceResult-shaped objects for mockAcceptanceGate
function makeAcceptanceSuccess() {
  return { valid: true, buildErrors: [], issues: [], validationErrors: [], sanitizedOutput: {} };
}
function makeAcceptanceFailure(errors: BuildError[]) {
  return {
    valid: false,
    buildErrors: errors,
    issues: errors.map(e => ({ message: e.message, file: e.file })),
    validationErrors: [],
    sanitizedOutput: {},
  };
}

describe('DiagnosticRepairEngine', () => {
  let engine: DiagnosticRepairEngine;
  let mockProjectState: ProjectState;
  let mockAIProvider: AIProvider;
  let mockBuildValidator: {
    validate: ReturnType<typeof vi.fn>;
    formatErrorsForAI: ReturnType<typeof vi.fn>;
    validateCrossFileReferences: ReturnType<typeof vi.fn>;
  };
  let mockAcceptanceGate: { validate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new DiagnosticRepairEngine();

    mockProjectState = {
      id: 'test-project',
      name: 'Test Project',
      description: 'test',
      createdAt: new Date(),
      updatedAt: new Date(),
      currentVersionId: 'v1',
      files: {
        'src/App.tsx': 'export default function App() { return <div>hello</div>; }',
        'src/utils.ts': 'export const helper = () => {};',
        'package.json': '{"name":"test","dependencies":{"react":"^18.2.0"}}',
      },
    };

    mockBuildValidator = {
      validate: vi.fn(),
      formatErrorsForAI: vi.fn().mockReturnValue('=== BUILD ERRORS ===\ntest error'),
      validateCrossFileReferences: vi.fn().mockReturnValue([]),
    };

    mockAcceptanceGate = {
      validate: vi.fn().mockReturnValue(makeAcceptanceSuccess()),
    };

    mockAIProvider = {
      generate: vi.fn(),
      generateStreaming: vi.fn(),
    };
  });

  it('should return success when no errors exist', async () => {
    // mockAcceptanceGate.validate default is already makeAcceptanceSuccess()

    const result = await engine.repair({
      projectState: mockProjectState,
      updatedFiles: { 'src/App.tsx': 'updated content' },
      prompt: 'fix it',
      shouldIncludeDesignSystem: false,
      aiProvider: mockAIProvider,
      buildValidator: mockBuildValidator as any,
      acceptanceGate: mockAcceptanceGate as any,
    });

    expect(result.success).toBe(true);
    expect(result.totalAICalls).toBe(0);
    expect(result.repairLevel).toBe('deterministic');
  });

  it('should fix errors deterministically without AI calls', async () => {
    const depError = makeError({
      type: 'missing_dependency',
      message: "Package 'zustand' is imported but not in package.json",
    });
    // First validate: has errors; after deterministic fix: clean
    mockAcceptanceGate.validate
      .mockReturnValueOnce(makeAcceptanceFailure([depError]))
      .mockReturnValueOnce(makeAcceptanceSuccess());

    const result = await engine.repair({
      projectState: mockProjectState,
      updatedFiles: {
        'src/store.ts': "import { create } from 'zustand';",
      },
      prompt: 'add state',
      shouldIncludeDesignSystem: false,
      aiProvider: mockAIProvider,
      buildValidator: mockBuildValidator as any,
      acceptanceGate: mockAcceptanceGate as any,
    });

    expect(result.success).toBe(true);
    expect(result.totalAICalls).toBe(0);
    expect(result.repairLevel).toBe('deterministic');
    expect(mockAIProvider.generate).not.toHaveBeenCalled();
  });

  it('should escalate to targeted AI when deterministic fixes are insufficient', async () => {
    // "Unexpected token" doesn't match deterministic fix patterns, so
    // tryDeterministicFixes returns fixed=[] and no re-validate happens.
    // Flow: initial validate (errors) → targeted AI → validate (clean)
    const syntaxErr = makeError({ type: 'syntax_error', message: 'Unexpected token', severity: 'fixable' });
    mockAcceptanceGate.validate
      .mockReturnValueOnce(makeAcceptanceFailure([syntaxErr]))
      // After targeted AI: clean
      .mockReturnValueOnce(makeAcceptanceSuccess());

    mockAIProvider.generate = vi.fn().mockResolvedValue({
      success: true,
      content: JSON.stringify({
        files: [{
          path: 'src/App.tsx',
          operation: 'replace_file',
          content: 'export default function App() { return <div>fixed</div>; }',
        }],
      }),
    });

    const result = await engine.repair({
      projectState: mockProjectState,
      updatedFiles: { 'src/App.tsx': 'broken code' },
      prompt: 'fix it',
      shouldIncludeDesignSystem: false,
      aiProvider: mockAIProvider,
      buildValidator: mockBuildValidator as any,
      acceptanceGate: mockAcceptanceGate as any,
    });

    expect(result.success).toBe(true);
    expect(result.totalAICalls).toBe(1);
    expect(result.repairLevel).toBe('targeted-ai');

    // Verify temperature was 0.2
    expect(mockAIProvider.generate).toHaveBeenCalledTimes(1);
    expect(mockAIProvider.generate).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.2 })
    );
  });

  it('should escalate to broad AI when targeted AI fails', async () => {
    const persistentError = makeError({
      type: 'syntax_error',
      message: 'Complex syntax issue',
      severity: 'fixable',
    });

    // "Complex syntax issue" doesn't match deterministic fix patterns
    // Flow: initial (errors) → targeted AI validate (errors) → broad AI validate (clean)
    mockAcceptanceGate.validate
      .mockReturnValueOnce(makeAcceptanceFailure([persistentError]))
      .mockReturnValueOnce(makeAcceptanceFailure([persistentError]))
      .mockReturnValueOnce(makeAcceptanceSuccess());

    // Targeted AI: returns something but doesn't fix it
    // Broad AI: fixes it
    mockAIProvider.generate = vi.fn()
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          files: [{
            path: 'src/App.tsx',
            operation: 'replace_file',
            content: 'still broken',
          }],
        }),
      })
      .mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          files: [{
            path: 'src/App.tsx',
            operation: 'replace_file',
            content: 'export default function App() { return <div>fixed</div>; }',
          }],
        }),
      });

    const result = await engine.repair({
      projectState: mockProjectState,
      updatedFiles: { 'src/App.tsx': 'broken code' },
      prompt: 'fix it',
      shouldIncludeDesignSystem: false,
      aiProvider: mockAIProvider,
      buildValidator: mockBuildValidator as any,
      acceptanceGate: mockAcceptanceGate as any,
    });

    expect(result.success).toBe(true);
    expect(result.totalAICalls).toBe(2);
    expect(result.repairLevel).toBe('broad-ai');

    // Verify temperature changes: first call 0.2, second call 0.4
    const calls = (mockAIProvider.generate as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0].temperature).toBe(0.2);
    expect(calls[1][0].temperature).toBe(0.4);
  });

  it('should rollback and return partial success when all levels fail', async () => {
    const persistentError = makeError({
      type: 'syntax_error',
      message: 'Unfixable complex issue',
      severity: 'fixable',
      file: 'src/App.tsx',
    });

    mockAcceptanceGate.validate.mockReturnValue(makeAcceptanceFailure([persistentError]));

    // Both AI calls fail to fix
    mockAIProvider.generate = vi.fn().mockResolvedValue({
      success: true,
      content: JSON.stringify({
        files: [{
          path: 'src/App.tsx',
          operation: 'replace_file',
          content: 'still broken',
        }],
      }),
    });

    const checkpoint = {
      'src/App.tsx': 'original working content',
    };

    const result = await engine.repair({
      projectState: mockProjectState,
      updatedFiles: {
        'src/App.tsx': 'broken code',
        'src/utils.ts': 'export const newHelper = () => {};',
      },
      prompt: 'fix it',
      shouldIncludeDesignSystem: false,
      aiProvider: mockAIProvider,
      buildValidator: mockBuildValidator as any,
      acceptanceGate: mockAcceptanceGate as any,
      checkpoint,
    });

    expect(result.success).toBe(false);
    expect(result.partialSuccess).toBe(true);
    expect(result.rolledBackFiles).toContain('src/App.tsx');
    expect(result.repairLevel).toBe('rollback');
    expect(result.totalAICalls).toBe(2);

    // Verify rolled-back file content
    expect(result.updatedFiles['src/App.tsx']).toBe('original working content');
    // Non-broken file should be preserved
    expect(result.updatedFiles['src/utils.ts']).toBe('export const newHelper = () => {};');
  });

  it('should handle AI returning invalid JSON gracefully', async () => {
    mockAcceptanceGate.validate.mockReturnValue(
      makeAcceptanceFailure([makeError({ type: 'syntax_error', message: 'error', severity: 'fixable' })])
    );

    mockAIProvider.generate = vi.fn().mockResolvedValue({
      success: true,
      content: 'not valid json {{{{',
    });

    const result = await engine.repair({
      projectState: mockProjectState,
      updatedFiles: { 'src/App.tsx': 'broken' },
      prompt: 'fix it',
      shouldIncludeDesignSystem: false,
      aiProvider: mockAIProvider,
      buildValidator: mockBuildValidator as any,
      acceptanceGate: mockAcceptanceGate as any,
    });

    expect(result.success).toBe(false);
    expect(result.totalAICalls).toBe(2);
    expect(result.repairLevel).toBe('rollback');
  });

  it('should handle AI call failure gracefully', async () => {
    mockAcceptanceGate.validate.mockReturnValue(
      makeAcceptanceFailure([makeError({ type: 'syntax_error', message: 'error', severity: 'fixable' })])
    );

    mockAIProvider.generate = vi.fn().mockResolvedValue({
      success: false,
      error: 'API error',
    });

    const result = await engine.repair({
      projectState: mockProjectState,
      updatedFiles: { 'src/App.tsx': 'broken' },
      prompt: 'fix it',
      shouldIncludeDesignSystem: false,
      aiProvider: mockAIProvider,
      buildValidator: mockBuildValidator as any,
      acceptanceGate: mockAcceptanceGate as any,
    });

    expect(result.success).toBe(false);
    expect(result.totalAICalls).toBe(2);
  });

  it('should send batched error context in AI calls', async () => {
    // Use errors that WON'T be fixed deterministically so we can control flow
    const errors = [
      makeError({ type: 'syntax_error', message: 'Unexpected token in App', file: 'src/App.tsx' }),
      makeError({ type: 'syntax_error', message: 'Unexpected token in Page', file: 'src/Page.tsx' }),
    ];

    // "Unexpected token" doesn't match deterministic fix patterns
    // Flow: initial (errors) → targeted AI → validate (clean)
    mockAcceptanceGate.validate
      .mockReturnValueOnce(makeAcceptanceFailure(errors))
      .mockReturnValueOnce(makeAcceptanceSuccess());

    mockBuildValidator.formatErrorsForAI.mockReturnValue(
      'ERROR: Unexpected token in App\n  File: src/App.tsx\nERROR: Unexpected token in Page\n  File: src/Page.tsx\n'
    );

    mockAIProvider.generate = vi.fn().mockResolvedValue({
      success: true,
      content: JSON.stringify({
        files: [
          { path: 'src/App.tsx', operation: 'replace_file', content: 'fixed app' },
          { path: 'src/Page.tsx', operation: 'replace_file', content: 'fixed page' },
        ],
      }),
    });

    await engine.repair({
      projectState: mockProjectState,
      updatedFiles: {
        'src/App.tsx': 'broken',
        'src/Page.tsx': 'broken page',
      },
      prompt: 'fix it',
      shouldIncludeDesignSystem: false,
      aiProvider: mockAIProvider,
      buildValidator: mockBuildValidator as any,
      acceptanceGate: mockAcceptanceGate as any,
    });

    // formatErrorsForAI should have been called with ALL remaining errors (batched)
    expect(mockBuildValidator.formatErrorsForAI).toHaveBeenCalledWith(errors);
    // AI should have been called exactly once (targeted fixed it)
    expect(mockAIProvider.generate).toHaveBeenCalledTimes(1);
  });
});
