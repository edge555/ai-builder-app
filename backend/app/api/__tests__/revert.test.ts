import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, OPTIONS } from '../revert/route';

// Mock the security module
vi.mock('../../../lib/security', () => ({
    applyRateLimit: vi.fn(),
    RateLimitTier: {
        LOW_COST: 'LOW_COST',
        CONFIG: 'CONFIG',
        HIGH_COST: 'HIGH_COST',
    },
}));

// Mock the API utilities
vi.mock('../../../lib/api', () => ({
    getCorsHeaders: vi.fn(() => ({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    })),
    handleOptions: vi.fn(() => new Response(null, { status: 204 })),
    handleError: vi.fn((error, context, request) => {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }),
    AppError: {
        state: vi.fn((code, message, details, status) => ({
            code,
            message,
            details,
            status,
        })),
        network: vi.fn((code, message, details, status) => ({
            code,
            message,
            details,
            status,
        })),
    },
    withTimeout: vi.fn(),
    TimeoutError: class TimeoutError extends Error {
        constructor(message: string, public timeoutMs: number) {
            super(message);
            this.name = 'TimeoutError';
        }
    },
    withRouteContext: vi.fn().mockImplementation((_module: string, handler: any) => {
        return (request: any) => handler(
            { requestId: 'test-id', contextLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }, setRateLimitHeaders: vi.fn() },
            request
        );
    }),
    parseJsonRequest: vi.fn().mockImplementation(async (request: any, schema: any) => {
        try {
            const body = await request.json();
            const data = schema.parse(body);
            return { ok: true, data };
        } catch {
            return { ok: false, response: new Response('Invalid request', { status: 400 }) };
        }
    }),
}));

// Mock the core module
vi.mock('../../../lib/core', () => ({
    getVersionManager: vi.fn(),
}));

// Mock the shared module
vi.mock('@ai-app-builder/shared', () => ({
    RevertVersionRequestSchema: {
        parse: vi.fn(),
    },
    serializeProjectState: vi.fn(),
    serializeVersion: vi.fn(),
}));

// Mock the logger
vi.mock('../../../lib/logger', () => ({
    createLogger: vi.fn(() => ({
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    })),
}));

describe('Revert API Endpoint', () => {
    const mockProjectState = {
        name: 'Test Project',
        files: [
            {
                path: 'index.js',
                content: 'console.log("Hello");',
            },
        ],
    };

    const mockVersion = {
        id: 'v1',
        timestamp: '2024-01-01T00:00:00.000Z',
        description: 'Initial version',
        files: [],
    };

    const mockRevertResult = {
        success: true,
        projectState: mockProjectState,
        version: mockVersion,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('OPTIONS /api/revert', () => {
        it('should return 204 status for OPTIONS request', async () => {
            const response = await OPTIONS();
            expect(response.status).toBe(204);
        });
    });

    describe('POST /api/revert', () => {
        it('should return 200 status with reverted project state', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getVersionManager } = await import('../../../lib/core');
            const { RevertVersionRequestSchema, serializeProjectState, serializeVersion } = await import('@ai-app-builder/shared');
            const { withTimeout } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (RevertVersionRequestSchema.parse as any).mockReturnValue({
                projectId: 'test-project',
                versionId: 'v1',
            });
            
            const mockVersionManager = {
                revertToVersion: vi.fn().mockResolvedValue(mockRevertResult),
            };
            (getVersionManager as any).mockReturnValue(mockVersionManager);
            
            (withTimeout as any).mockResolvedValue(mockRevertResult);
            (serializeProjectState as any).mockReturnValue(mockProjectState);
            (serializeVersion as any).mockReturnValue(mockVersion);

            const request = new NextRequest('http://localhost/api/revert', {
                method: 'POST',
                body: JSON.stringify({ projectId: 'test-project', versionId: 'v1' }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.projectState).toEqual(mockProjectState);
            expect(data.version).toEqual(mockVersion);
        });

        it('should use LOW_COST rate limit tier', async () => {
            const { applyRateLimit, RateLimitTier } = await import('../../../lib/security');
            const { RevertVersionRequestSchema } = await import('@ai-app-builder/shared');
            const { withTimeout } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (RevertVersionRequestSchema.parse as any).mockReturnValue({
                projectId: 'test-project',
                versionId: 'v1',
            });
            (withTimeout as any).mockResolvedValue(mockRevertResult);

            const request = new NextRequest('http://localhost/api/revert', {
                method: 'POST',
                body: JSON.stringify({ projectId: 'test-project', versionId: 'v1' }),
            });

            await POST(request);

            expect(applyRateLimit).toHaveBeenCalledWith(request, RateLimitTier.LOW_COST);
        });

        it('should validate request body against schema', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { RevertVersionRequestSchema } = await import('@ai-app-builder/shared');

            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (RevertVersionRequestSchema.parse as any).mockImplementation(() => {
                throw new Error('Invalid request');
            });

            const request = new NextRequest('http://localhost/api/revert', {
                method: 'POST',
                body: JSON.stringify({ invalid: 'data' }),
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
        });

        it('should call versionManager.revertToVersion with correct parameters', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getVersionManager } = await import('../../../lib/core');
            const { RevertVersionRequestSchema } = await import('@ai-app-builder/shared');
            const { withTimeout } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (RevertVersionRequestSchema.parse as any).mockReturnValue({
                projectId: 'my-project',
                versionId: 'v2',
            });
            
            const mockVersionManager = {
                revertToVersion: vi.fn().mockResolvedValue(mockRevertResult),
            };
            (getVersionManager as any).mockReturnValue(mockVersionManager);
            (withTimeout as any).mockImplementation((promise: any) => promise);

            const request = new NextRequest('http://localhost/api/revert', {
                method: 'POST',
                body: JSON.stringify({ projectId: 'my-project', versionId: 'v2' }),
            });

            await POST(request);

            expect(mockVersionManager.revertToVersion).toHaveBeenCalledWith('my-project', 'v2');
        });

        it('should handle revert operation with timeout', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getVersionManager } = await import('../../../lib/core');
            const { RevertVersionRequestSchema } = await import('@ai-app-builder/shared');
            const { withTimeout } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (RevertVersionRequestSchema.parse as any).mockReturnValue({
                projectId: 'test-project',
                versionId: 'v1',
            });
            
            const mockVersionManager = {
                revertToVersion: vi.fn().mockResolvedValue(mockRevertResult),
            };
            (getVersionManager as any).mockReturnValue(mockVersionManager);
            (withTimeout as any).mockImplementation((promise: any, options: any) => promise);

            const request = new NextRequest('http://localhost/api/revert', {
                method: 'POST',
                body: JSON.stringify({ projectId: 'test-project', versionId: 'v1' }),
            });

            await POST(request);

            expect(withTimeout).toHaveBeenCalledWith(
                expect.any(Promise),
                expect.objectContaining({
                    timeoutMs: 30000,
                    operationName: 'version revert',
                })
            );
        });

        it('should handle failed revert operation', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getVersionManager } = await import('../../../lib/core');
            const { RevertVersionRequestSchema } = await import('@ai-app-builder/shared');
            const { withTimeout, AppError, handleError: apiHandleError } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (RevertVersionRequestSchema.parse as any).mockReturnValue({
                projectId: 'test-project',
                versionId: 'v1',
            });
            
            const mockFailedResult = {
                success: false,
                error: 'Version not found',
            };
            
            const mockVersionManager = {
                revertToVersion: vi.fn().mockResolvedValue(mockFailedResult),
            };
            (getVersionManager as any).mockReturnValue(mockVersionManager);
            (withTimeout as any).mockResolvedValue(mockFailedResult);

            const request = new NextRequest('http://localhost/api/revert', {
                method: 'POST',
                body: JSON.stringify({ projectId: 'test-project', versionId: 'v1' }),
            });

            const response = await POST(request);

            expect(AppError.state).toHaveBeenCalledWith(
                'REVERT_FAILED',
                'Version not found',
                undefined,
                404
            );
            expect(apiHandleError).toHaveBeenCalled();
        });

        it('should handle timeout errors', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { RevertVersionRequestSchema } = await import('@ai-app-builder/shared');
            const { withTimeout, TimeoutError, AppError, handleError: apiHandleError } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (RevertVersionRequestSchema.parse as any).mockReturnValue({
                projectId: 'test-project',
                versionId: 'v1',
            });
            
            const timeoutError = new TimeoutError('Operation timed out', 30000);
            (withTimeout as any).mockRejectedValue(timeoutError);

            const request = new NextRequest('http://localhost/api/revert', {
                method: 'POST',
                body: JSON.stringify({ projectId: 'test-project', versionId: 'v1' }),
            });

            const response = await POST(request);

            expect(AppError.network).toHaveBeenCalledWith(
                'OPERATION_TIMEOUT',
                'Version revert timed out after 30 seconds',
                { timeoutMs: 30000 },
                504
            );
            expect(apiHandleError).toHaveBeenCalled();
        });

        it('should return rate limit response when rate limited', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const rateLimitResponse = new Response('Too Many Requests', { status: 429 });
            (applyRateLimit as any).mockReturnValue(rateLimitResponse);

            const request = new NextRequest('http://localhost/api/revert', {
                method: 'POST',
                body: JSON.stringify({ projectId: 'test-project', versionId: 'v1' }),
            });

            const response = await POST(request);

            expect(response.status).toBe(429);
        });

        it('should include CORS headers in response', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getVersionManager } = await import('../../../lib/core');
            const { RevertVersionRequestSchema, serializeProjectState, serializeVersion } = await import('@ai-app-builder/shared');
            const { withTimeout, getCorsHeaders } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (RevertVersionRequestSchema.parse as any).mockReturnValue({
                projectId: 'test-project',
                versionId: 'v1',
            });
            
            const mockVersionManager = {
                revertToVersion: vi.fn().mockResolvedValue(mockRevertResult),
            };
            (getVersionManager as any).mockReturnValue(mockVersionManager);
            (withTimeout as any).mockResolvedValue(mockRevertResult);
            (serializeProjectState as any).mockReturnValue(mockProjectState);
            (serializeVersion as any).mockReturnValue(mockVersion);
            
            const mockCorsHeaders = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            };
            (getCorsHeaders as any).mockReturnValue(mockCorsHeaders);

            const request = new NextRequest('http://localhost/api/revert', {
                method: 'POST',
                body: JSON.stringify({ projectId: 'test-project', versionId: 'v1' }),
            });

            const response = await POST(request);

            expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
        });

        it('should serialize project state and version for response', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getVersionManager } = await import('../../../lib/core');
            const { RevertVersionRequestSchema, serializeProjectState, serializeVersion } = await import('@ai-app-builder/shared');
            const { withTimeout } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (RevertVersionRequestSchema.parse as any).mockReturnValue({
                projectId: 'test-project',
                versionId: 'v1',
            });
            
            const mockVersionManager = {
                revertToVersion: vi.fn().mockResolvedValue(mockRevertResult),
            };
            (getVersionManager as any).mockReturnValue(mockVersionManager);
            (withTimeout as any).mockResolvedValue(mockRevertResult);
            
            const serializedState = { ...mockProjectState, serialized: true };
            const serializedVersion = { ...mockVersion, serialized: true };
            (serializeProjectState as any).mockReturnValue(serializedState);
            (serializeVersion as any).mockReturnValue(serializedVersion);

            const request = new NextRequest('http://localhost/api/revert', {
                method: 'POST',
                body: JSON.stringify({ projectId: 'test-project', versionId: 'v1' }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(serializeProjectState).toHaveBeenCalledWith(mockProjectState);
            expect(serializeVersion).toHaveBeenCalledWith(mockVersion);
            expect(data.projectState).toEqual(serializedState);
            expect(data.version).toEqual(serializedVersion);
        });
    });
});
