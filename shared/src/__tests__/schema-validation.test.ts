import { describe, it, expect } from 'vitest';
import { ModifyProjectRequestSchema } from '../schemas/api';

const baseProject = {
    id: 'proj-1',
    name: 'Test Project',
    description: 'A test project',
    files: { 'src/App.tsx': 'export default function App() { return null; }' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentVersionId: 'v1',
};

const baseRequest = {
    projectState: baseProject,
    prompt: 'Fix the bug',
};

describe('ModifyProjectRequestSchema — runtimeError', () => {
    it('accepts a valid runtimeError with all enum values', () => {
        const result = ModifyProjectRequestSchema.safeParse({
            ...baseRequest,
            runtimeError: {
                message: 'Something broke',
                type: 'RENDER_ERROR',
                source: 'error_boundary',
                priority: 'high',
            },
        });
        expect(result.success).toBe(true);
    });

    it('rejects an invalid type string', () => {
        const result = ModifyProjectRequestSchema.safeParse({
            ...baseRequest,
            runtimeError: {
                message: 'Something broke',
                type: 'INVALID_TYPE',
                source: 'bundler',
                priority: 'low',
            },
        });
        expect(result.success).toBe(false);
    });

    it('rejects when required type field is missing', () => {
        const result = ModifyProjectRequestSchema.safeParse({
            ...baseRequest,
            runtimeError: {
                message: 'Something broke',
                source: 'bundler',
                priority: 'low',
            },
        });
        expect(result.success).toBe(false);
    });

    it('rejects when required source field is missing', () => {
        const result = ModifyProjectRequestSchema.safeParse({
            ...baseRequest,
            runtimeError: {
                message: 'Something broke',
                type: 'BUILD_ERROR',
                priority: 'critical',
            },
        });
        expect(result.success).toBe(false);
    });

    it('rejects when required priority field is missing', () => {
        const result = ModifyProjectRequestSchema.safeParse({
            ...baseRequest,
            runtimeError: {
                message: 'Something broke',
                type: 'BUILD_ERROR',
                source: 'bundler',
            },
        });
        expect(result.success).toBe(false);
    });

    it('strips extra unknown fields (no passthrough)', () => {
        const result = ModifyProjectRequestSchema.safeParse({
            ...baseRequest,
            runtimeError: {
                message: 'Something broke',
                type: 'BUILD_ERROR',
                source: 'bundler',
                priority: 'critical',
                unknownField: 'should be stripped',
            },
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect((result.data.runtimeError as Record<string, unknown>)?.unknownField).toBeUndefined();
        }
    });

    it('accepts all valid RuntimeErrorType values', () => {
        const types = [
            'BUILD_ERROR', 'IMPORT_ERROR', 'UNDEFINED_EXPORT', 'RENDER_ERROR',
            'REFERENCE_ERROR', 'TYPE_ERROR', 'SYNTAX_ERROR', 'NETWORK_ERROR',
            'PROMISE_ERROR', 'CSS_ERROR', 'HYDRATION_ERROR', 'UNKNOWN_ERROR',
        ];
        for (const type of types) {
            const result = ModifyProjectRequestSchema.safeParse({
                ...baseRequest,
                runtimeError: { message: 'err', type, source: 'bundler', priority: 'low' },
            });
            expect(result.success).toBe(true);
        }
    });

    it('accepts all valid ErrorSource values', () => {
        const sources = ['bundler', 'console', 'error_boundary', 'network', 'manual'];
        for (const source of sources) {
            const result = ModifyProjectRequestSchema.safeParse({
                ...baseRequest,
                runtimeError: { message: 'err', type: 'UNKNOWN_ERROR', source, priority: 'low' },
            });
            expect(result.success).toBe(true);
        }
    });

    it('accepts all valid ErrorPriority values', () => {
        const priorities = ['critical', 'high', 'medium', 'low'];
        for (const priority of priorities) {
            const result = ModifyProjectRequestSchema.safeParse({
                ...baseRequest,
                runtimeError: { message: 'err', type: 'UNKNOWN_ERROR', source: 'bundler', priority },
            });
            expect(result.success).toBe(true);
        }
    });

    it('passes when runtimeError is omitted (optional at top level)', () => {
        const result = ModifyProjectRequestSchema.safeParse(baseRequest);
        expect(result.success).toBe(true);
    });
});

describe('ModifyProjectRequestSchema — errorContext', () => {
    it('accepts a valid errorContext.errorType', () => {
        const result = ModifyProjectRequestSchema.safeParse({
            ...baseRequest,
            errorContext: {
                affectedFiles: ['src/App.tsx'],
                errorType: 'RENDER_ERROR',
            },
        });
        expect(result.success).toBe(true);
    });

    it('rejects an invalid errorContext.errorType', () => {
        const result = ModifyProjectRequestSchema.safeParse({
            ...baseRequest,
            errorContext: {
                affectedFiles: ['src/App.tsx'],
                errorType: 'NOT_A_VALID_TYPE',
            },
        });
        expect(result.success).toBe(false);
    });

    it('passes when errorContext is omitted', () => {
        const result = ModifyProjectRequestSchema.safeParse(baseRequest);
        expect(result.success).toBe(true);
    });
});
