import type { ApiError } from '@ai-app-builder/shared';

/**
 * Custom application error class that matches the ApiError shape.
 */
export class AppError extends Error {
    public readonly type: ApiError['type'];
    public readonly code: string;
    public readonly details?: Record<string, unknown>;
    public readonly recoverable: boolean;
    public readonly statusCode: number;

    constructor(options: {
        type: ApiError['type'];
        code: string;
        message: string;
        details?: Record<string, unknown>;
        recoverable?: boolean;
        statusCode?: number;
    }) {
        super(options.message);
        this.name = 'AppError';
        this.type = options.type;
        this.code = options.code;
        this.details = options.details;
        this.recoverable = options.recoverable ?? true;
        this.statusCode = options.statusCode ?? 500;

        // Maintain proper stack trace (Node.js/V8 specific)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AppError);
        }
    }

    /**
     * Factory for API/Request errors (400)
     */
    static api(code: string, message: string, details?: Record<string, unknown>, recoverable = true): AppError {
        return new AppError({ type: 'api', code, message, details, recoverable, statusCode: 400 });
    }

    /**
     * Factory for validation errors (422)
     */
    static validation(message: string, details?: Record<string, unknown>, recoverable = true): AppError {
        return new AppError({ type: 'validation', code: 'VALIDATION_FAILED', message, details, recoverable, statusCode: 422 });
    }

    /**
     * Factory for AI output errors (422)
     */
    static aiOutput(message: string, details?: Record<string, unknown>, recoverable = true): AppError {
        return new AppError({ type: 'ai_output', code: 'GENERATION_FAILED', message, details, recoverable, statusCode: 422 });
    }

    /**
     * Factory for state errors (409/404)
     */
    static state(code: string, message: string, details?: Record<string, unknown>, statusCode = 409): AppError {
        return new AppError({ type: 'state', code, message, details, recoverable: true, statusCode });
    }

    /**
     * Factory for timeout errors (408)
     */
    static timeout(message: string, details?: Record<string, unknown>): AppError {
        return new AppError({ type: 'timeout', code: 'TIMEOUT', message, details, recoverable: true, statusCode: 408 });
    }

    /**
     * Factory for rate limit errors (429)
     */
    static rateLimit(message: string, details?: Record<string, unknown>): AppError {
        return new AppError({ type: 'rate_limit', code: 'RATE_LIMIT_EXCEEDED', message, details, recoverable: true, statusCode: 429 });
    }

    /**
     * Factory for unknown/internal errors (500)
     */
    static unknown(message = 'An unexpected error occurred', details?: Record<string, unknown>): AppError {
        return new AppError({ type: 'unknown', code: 'INTERNAL_ERROR', message, details, recoverable: true, statusCode: 500 });
    }

    /**
     * Converts this AppError to a standardized ApiError object.
     */
    toApiError(): ApiError {
        return {
            type: this.type,
            code: this.code,
            message: this.message,
            details: this.details,
            recoverable: this.recoverable,
        };
    }
}
