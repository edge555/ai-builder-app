import { describe, expect, it, vi, beforeEach } from 'vitest';

import { createRepairService } from '../repairService';
import type { RepairExecutionDependencies } from '../types';

vi.mock('@/utils/repair-prompt', () => ({
    buildRepairPrompt: vi.fn(() => 'repair this error'),
}));

const makeRuntimeError = (message = 'ReferenceError: x is not defined', filePath?: string) => ({
    message,
    filePath: filePath ?? 'src/App.tsx',
    type: 'REFERENCE_ERROR' as const,
    priority: 'high' as const,
    source: 'console' as const,
    timestamp: new Date().toISOString(),
    componentStack: undefined,
});

const makeProjectState = () => ({
    id: 'p1',
    name: 'Test',
    description: '',
    files: { 'src/App.tsx': 'code' },
    createdAt: '',
    updatedAt: '',
    currentVersionId: '',
});

const makeDeps = (overrides?: Partial<RepairExecutionDependencies>): RepairExecutionDependencies => ({
    errorAggregator: { errors: [], addError: vi.fn(), clear: vi.fn() } as any,
    executeRepair: vi.fn().mockResolvedValue({ success: true, projectState: makeProjectState() }),
    onAttemptStart: vi.fn(),
    onAttemptFinish: vi.fn(),
    ...overrides,
});

describe('repairService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('executes a repair and returns success result', async () => {
        const deps = makeDeps();
        const service = createRepairService(deps);

        const result = await service.runRepair({
            runtimeError: makeRuntimeError(),
            projectState: makeProjectState(),
        });

        expect(result.executed).toBe(true);
        expect(result.success).toBe(true);
        expect(result.attempt).toBe(1);
        expect(result.explanation).toBe('Fixed: Resolved an issue in src/App.tsx.');
        expect(deps.onAttemptStart).toHaveBeenCalledWith(1);
        expect(deps.onAttemptFinish).toHaveBeenCalled();
    });

    it('skips repair when projectState is null', async () => {
        const deps = makeDeps();
        const service = createRepairService(deps);

        const result = await service.runRepair({
            runtimeError: makeRuntimeError(),
            projectState: null,
        });

        expect(result.executed).toBe(false);
        expect(result.success).toBe(false);
        expect(deps.executeRepair).not.toHaveBeenCalled();
    });

    it('allows retrying the same error after the previous attempt completes', async () => {
        const deps = makeDeps();
        const service = createRepairService(deps);
        const error = makeRuntimeError();

        await service.runRepair({ runtimeError: error, projectState: makeProjectState() });
        const second = await service.runRepair({ runtimeError: error, projectState: makeProjectState() });

        expect(second.executed).toBe(true);
        expect(deps.executeRepair).toHaveBeenCalledTimes(2);
    });

    it('skips repair when maxAttempts is reached', async () => {
        const deps = makeDeps({ maxAttempts: 2 });
        const service = createRepairService(deps);

        await service.runRepair({ runtimeError: makeRuntimeError('err1'), projectState: makeProjectState() });
        await service.runRepair({ runtimeError: makeRuntimeError('err2'), projectState: makeProjectState() });
        const third = await service.runRepair({ runtimeError: makeRuntimeError('err3'), projectState: makeProjectState() });

        expect(third.executed).toBe(false);
        expect(deps.executeRepair).toHaveBeenCalledTimes(2);
    });

    it('returns failure result when executeRepair returns success=false', async () => {
        const deps = makeDeps({
            executeRepair: vi.fn().mockResolvedValue({ success: false, error: 'repair failed' }),
        });
        const service = createRepairService(deps);

        const result = await service.runRepair({
            runtimeError: makeRuntimeError(),
            projectState: makeProjectState(),
        });

        expect(result.executed).toBe(true);
        expect(result.success).toBe(false);
        expect(result.error).toBe('repair failed');
    });

    it('returns failure when executeRepair throws', async () => {
        const deps = makeDeps({
            executeRepair: vi.fn().mockRejectedValue(new Error('network failure')),
        });
        const service = createRepairService(deps);

        const result = await service.runRepair({
            runtimeError: makeRuntimeError(),
            projectState: makeProjectState(),
        });

        expect(result.executed).toBe(true);
        expect(result.success).toBe(false);
        expect(result.error).toBe('network failure');
        expect(deps.onAttemptFinish).toHaveBeenCalled();
    });

    it('includes partialSuccess and rolledBackFiles on success', async () => {
        const deps = makeDeps({
            executeRepair: vi.fn().mockResolvedValue({
                success: true,
                partialSuccess: true,
                rolledBackFiles: ['src/Broken.tsx'],
                projectState: makeProjectState(),
            }),
        });
        const service = createRepairService(deps);

        const result = await service.runRepair({
            runtimeError: makeRuntimeError(),
            projectState: makeProjectState(),
        });

        expect(result.partialSuccess).toBe(true);
        expect(result.rolledBackFiles).toEqual(['src/Broken.tsx']);
    });

    it('reset clears attempt count so repairs can run again', async () => {
        const deps = makeDeps({ maxAttempts: 1 });
        const service = createRepairService(deps);

        await service.runRepair({ runtimeError: makeRuntimeError('e1'), projectState: makeProjectState() });
        const blocked = await service.runRepair({ runtimeError: makeRuntimeError('e2'), projectState: makeProjectState() });
        expect(blocked.executed).toBe(false);

        service.reset();

        const afterReset = await service.runRepair({ runtimeError: makeRuntimeError('e3'), projectState: makeProjectState() });
        expect(afterReset.executed).toBe(true);
        expect(afterReset.success).toBe(true);
    });

    it('collects affected files from aggregatedErrors', async () => {
        const deps = makeDeps();
        const service = createRepairService(deps);

        await service.runRepair({
            runtimeError: makeRuntimeError('err', 'src/App.tsx'),
            projectState: makeProjectState(),
            aggregatedErrors: {
                errors: [{ message: 'err2', filePath: 'src/Other.tsx', type: 'REFERENCE_ERROR', priority: 'high', source: 'console', timestamp: new Date().toISOString() }],
                countByType: { REFERENCE_ERROR: 1 },
                affectedFiles: ['src/Other.tsx'],
                hasCriticalErrors: false,
                totalCount: 1,
            },
        });

        const callArgs = (deps.executeRepair as any).mock.calls[0][0];
        const affectedFiles = callArgs.options.errorContext.affectedFiles as string[];
        expect(affectedFiles).toContain('src/App.tsx');
        expect(affectedFiles).toContain('src/Other.tsx');
    });

    it('builds explanation from changeSummary description', async () => {
        const deps = makeDeps({
            executeRepair: vi.fn().mockResolvedValue({
                success: true,
                projectState: makeProjectState(),
                changeSummary: { description: 'updated error boundary and import paths' },
            }),
        });
        const service = createRepairService(deps);

        const result = await service.runRepair({
            runtimeError: makeRuntimeError(),
            projectState: makeProjectState(),
        });

        expect(result.success).toBe(true);
        expect(result.explanation).toBe('Fixed: updated error boundary and import paths.');
    });

    it('uses generic explanation when filePath and changeSummary are unavailable', async () => {
        const deps = makeDeps({
            executeRepair: vi.fn().mockResolvedValue({
                success: true,
                projectState: makeProjectState(),
            }),
        });
        const service = createRepairService(deps);

        const result = await service.runRepair({
            runtimeError: {
                message: 'x is not defined',
                type: 'REFERENCE_ERROR',
                priority: 'high',
                source: 'console',
                timestamp: new Date().toISOString(),
            },
            projectState: makeProjectState(),
        });

        expect(result.success).toBe(true);
        expect(result.explanation).toBe('Fixed: Applied automatic code corrections.');
    });
});
