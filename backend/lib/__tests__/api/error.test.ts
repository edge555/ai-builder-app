import { describe, it, expect, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { AppError } from '../../api/error';
import { handleError } from '../../api/utils';

// Mock next/server
vi.mock('next/server', () => ({
    NextResponse: {
        json: vi.fn((data, init) => ({
            data,
            status: init?.status,
            headers: init?.headers,
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

describe('AppError', () => {
    it('should create an AppError with correct properties', () => {
        const error = new AppError({
            type: 'api',
            code: 'TEST_ERROR',
            message: 'Test message',
            statusCode: 400,
        });

        expect(error.type).toBe('api');
        expect(error.code).toBe('TEST_ERROR');
        expect(error.message).toBe('Test message');
        expect(error.statusCode).toBe(400);
        expect(error.recoverable).toBe(true);
    });

    it('should create correct shapes using factory methods', () => {
        const validationError = AppError.validation('Invalid input', { field: 'email' });
        expect(validationError.type).toBe('validation');
        expect(validationError.statusCode).toBe(422);
        expect(validationError.details).toEqual({ field: 'email' });

        const apiError = AppError.api('RATE_LIMIT', 'Too many requests');
        expect(apiError.type).toBe('api');
        expect(apiError.code).toBe('RATE_LIMIT');
        expect(apiError.statusCode).toBe(400);
    });

    it('should convert to ApiError shape correctly', () => {
        const error = AppError.validation('Invalid');
        const apiError = error.toApiError();

        expect(apiError).toEqual({
            type: 'validation',
            code: 'VALIDATION_FAILED',
            message: 'Invalid',
            details: undefined,
            recoverable: true,
        });
    });
});

describe('handleError', () => {
    it('should return correct response for AppError', () => {
        const error = AppError.validation('Validation failed');
        const response = handleError(error, 'test/route') as any;

        expect(NextResponse.json).toHaveBeenCalled();
        expect(response.status).toBe(422);
        expect(response.data.success).toBe(false);
        expect(response.data.error.type).toBe('validation');
    });

    it('should return 500 for unknown errors', () => {
        const error = new Error('Database down');
        const response = handleError(error, 'test/route') as any;

        expect(response.status).toBe(500);
        expect(response.data.success).toBe(false);
        expect(response.data.error.code).toBe('INTERNAL_ERROR');
        expect(response.data.error.details.originalError).toBe('Database down');
    });
});
