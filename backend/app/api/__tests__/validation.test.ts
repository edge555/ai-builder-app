import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { handleError } from '../../api/utils';

// Mock next/server
vi.mock('next/server', () => ({
    NextResponse: {
        json: vi.fn((data, init) => ({
            data,
            status: init?.status,
            headers: init?.headers,
            json: async () => data,
        })),
    },
}));

// Mock logger
vi.mock('../../logger', () => ({
    createLogger: () => ({
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    }),
}));

describe('API Validation Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle Zod validation errors in handleError', async () => {
        const schema = { parse: () => { throw new ZodError([{ code: 'invalid_string', path: ['description'], message: 'Required', validation: 'email' }]) } };

        try {
            schema.parse();
        } catch (error) {
            const response = handleError(error, 'test/route') as any;

            expect(response.status).toBe(422);
            expect(response.data.success).toBe(false);
            expect(response.data.error.type).toBe('validation');
            expect(response.data.error.code).toBe('VALIDATION_FAILED');
            expect(response.data.error.details.issues).toBeDefined();
            expect(response.data.error.details.issues[0].path).toContain('description');
        }
    });

    it('should handle malformed JSON as an API error', async () => {
        // This is typically handled by request.json() or our manual check if we kept it, 
        // but in our new flow we let request.json() throw or handle it.
        // Let's simulate what happens if body parsing fails before validation.

        const error = new Error('Unexpected token'); // Simulating JSON parse error
        const response = handleError(error, 'test/route') as any;

        // Generic errors are 500 by default in our current handleError if not AppError or ZodError
        expect(response.status).toBe(500);
        expect(response.data.error.code).toBe('INTERNAL_ERROR');
    });
});
