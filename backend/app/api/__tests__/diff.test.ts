import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, OPTIONS } from '../diff/route';

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
}));

// Mock the core module
vi.mock('../../../lib/core', () => ({
    getVersionManager: vi.fn(),
}));

// Mock the diff module
vi.mock('../../../lib/diff', () => ({
    getDiffEngine: vi.fn(),
}));

// Mock the shared module
vi.mock('@ai-app-builder/shared/schemas', () => ({
    ComputeDiffRequestSchema: {
        parse: vi.fn(),
    },
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

describe('Diff API Endpoint', () => {
    const mockFromVersion = {
        id: 'v1',
        timestamp: '2024-01-01T00:00:00.000Z',
        description: 'Initial version',
        files: [
            {
                path: 'index.js',
                content: 'console.log("Hello");',
            },
        ],
    };

    const mockToVersion = {
        id: 'v2',
        timestamp: '2024-01-02T00:00:00.000Z',
        description: 'Second version',
        files: [
            {
                path: 'index.js',
                content: 'console.log("Hello World");',
            },
        ],
    };

    const mockDiffs = [
        {
            filePath: 'index.js',
            changes: [
                {
                    type: 'replace',
                    oldContent: 'console.log("Hello");',
                    newContent: 'console.log("Hello World");',
                    line: 1,
                },
            ],
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('OPTIONS /api/diff', () => {
        it('should return 204 status for OPTIONS request', async () => {
            const response = await OPTIONS();
            expect(response.status).toBe(204);
        });
    });

    describe('POST /api/diff', () => {
        it('should return 200 status with diffs when projectId is provided', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getVersionManager } = await import('../../../lib/core');
            const { getDiffEngine } = await import('../../../lib/diff');
            const { ComputeDiffRequestSchema } = await import('@ai-app-builder/shared/schemas');
            const { withTimeout } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (ComputeDiffRequestSchema.parse as any).mockReturnValue({
                fromVersionId: 'v1',
                toVersionId: 'v2',
                projectId: 'test-project',
            });
            
            const mockVersionManager = {
                getVersion: vi.fn()
                    .mockReturnValueOnce(mockFromVersion)
                    .mockReturnValueOnce(mockToVersion),
            };
            (getVersionManager as any).mockReturnValue(mockVersionManager);
            
            const mockDiffEngine = {
                computeDiffsFromFiles: vi.fn().mockResolvedValue(mockDiffs),
            };
            (getDiffEngine as any).mockReturnValue(mockDiffEngine);
            (withTimeout as any).mockResolvedValue(mockDiffs);

            const request = new NextRequest('http://localhost/api/diff', {
                method: 'POST',
                body: JSON.stringify({
                    fromVersionId: 'v1',
                    toVersionId: 'v2',
                    projectId: 'test-project',
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.diffs).toEqual(mockDiffs);
            expect(mockVersionManager.getVersion).toHaveBeenCalledWith('test-project', 'v1');
            expect(mockVersionManager.getVersion).toHaveBeenCalledWith('test-project', 'v2');
        });

        it('should find versions when projectId is not provided', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getVersionManager } = await import('../../../lib/core');
            const { getDiffEngine } = await import('../../../lib/diff');
            const { ComputeDiffRequestSchema } = await import('@ai-app-builder/shared/schemas');
            const { withTimeout } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (ComputeDiffRequestSchema.parse as any).mockReturnValue({
                fromVersionId: 'v1',
                toVersionId: 'v2',
            });
            
            const mockVersionManager = {
                findVersion: vi.fn()
                    .mockReturnValueOnce({ version: mockFromVersion, projectId: 'test-project' })
                    .mockReturnValueOnce({ version: mockToVersion, projectId: 'test-project' }),
            };
            (getVersionManager as any).mockReturnValue(mockVersionManager);
            
            const mockDiffEngine = {
                computeDiffsFromFiles: vi.fn().mockResolvedValue(mockDiffs),
            };
            (getDiffEngine as any).mockReturnValue(mockDiffEngine);
            (withTimeout as any).mockResolvedValue(mockDiffs);

            const request = new NextRequest('http://localhost/api/diff', {
                method: 'POST',
                body: JSON.stringify({
                    fromVersionId: 'v1',
                    toVersionId: 'v2',
                }),
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(mockVersionManager.findVersion).toHaveBeenCalledWith('v1');
            expect(mockVersionManager.findVersion).toHaveBeenCalledWith('v2');
        });

        it('should use LOW_COST rate limit tier', async () => {
            const { applyRateLimit, RateLimitTier } = await import('../../../lib/security');
            const { ComputeDiffRequestSchema } = await import('@ai-app-builder/shared/schemas');
            const { withTimeout } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (ComputeDiffRequestSchema.parse as any).mockReturnValue({
                fromVersionId: 'v1',
                toVersionId: 'v2',
                projectId: 'test-project',
            });
            (withTimeout as any).mockResolvedValue(mockDiffs);

            const request = new NextRequest('http://localhost/api/diff', {
                method: 'POST',
                body: JSON.stringify({
                    fromVersionId: 'v1',
                    toVersionId: 'v2',
                    projectId: 'test-project',
                }),
            });

            await POST(request);

            expect(applyRateLimit).toHaveBeenCalledWith(request, RateLimitTier.LOW_COST);
        });

        it('should validate request body against schema', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { ComputeDiffRequestSchema } = await import('@ai-app-builder/shared/schemas');
            const { handleError: apiHandleError } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (ComputeDiffRequestSchema.parse as any).mockImplementation(() => {
                throw new Error('Invalid request');
            });

            const request = new NextRequest('http://localhost/api/diff', {
                method: 'POST',
                body: JSON.stringify({ invalid: 'data' }),
            });

            const response = await POST(request);

            expect(apiHandleError).toHaveBeenCalledWith(
                expect.any(Error),
                'api/diff',
                request
            );
        });

        it('should throw error when fromVersion is not found', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getVersionManager } = await import('../../../lib/core');
            const { ComputeDiffRequestSchema } = await import('@ai-app-builder/shared/schemas');
            const { AppError, handleError: apiHandleError } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (ComputeDiffRequestSchema.parse as any).mockReturnValue({
                fromVersionId: 'v1',
                toVersionId: 'v2',
                projectId: 'test-project',
            });
            
            const mockVersionManager = {
                getVersion: vi.fn().mockReturnValue(null),
            };
            (getVersionManager as any).mockReturnValue(mockVersionManager);

            const request = new NextRequest('http://localhost/api/diff', {
                method: 'POST',
                body: JSON.stringify({
                    fromVersionId: 'v1',
                    toVersionId: 'v2',
                    projectId: 'test-project',
                }),
            });

            const response = await POST(request);

            expect(AppError.state).toHaveBeenCalledWith(
                'FROM_VERSION_NOT_FOUND',
                "Version with ID 'v1' not found",
                { versionId: 'v1' },
                404
            );
            expect(apiHandleError).toHaveBeenCalled();
        });

        it('should throw error when toVersion is not found', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getVersionManager } = await import('../../../lib/core');
            const { ComputeDiffRequestSchema } = await import('@ai-app-builder/shared/schemas');
            const { AppError, handleError: apiHandleError } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (ComputeDiffRequestSchema.parse as any).mockReturnValue({
                fromVersionId: 'v1',
                toVersionId: 'v2',
                projectId: 'test-project',
            });
            
            const mockVersionManager = {
                getVersion: vi.fn()
                    .mockReturnValueOnce(mockFromVersion)
                    .mockReturnValueOnce(null),
            };
            (getVersionManager as any).mockReturnValue(mockVersionManager);

            const request = new NextRequest('http://localhost/api/diff', {
                method: 'POST',
                body: JSON.stringify({
                    fromVersionId: 'v1',
                    toVersionId: 'v2',
                    projectId: 'test-project',
                }),
            });

            const response = await POST(request);

            expect(AppError.state).toHaveBeenCalledWith(
                'TO_VERSION_NOT_FOUND',
                "Version with ID 'v2' not found",
                { versionId: 'v2' },
                404
            );
            expect(apiHandleError).toHaveBeenCalled();
        });

        it('should throw error when versions belong to different projects', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getVersionManager } = await import('../../../lib/core');
            const { ComputeDiffRequestSchema } = await import('@ai-app-builder/shared/schemas');
            const { AppError, handleError: apiHandleError } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (ComputeDiffRequestSchema.parse as any).mockReturnValue({
                fromVersionId: 'v1',
                toVersionId: 'v2',
            });
            
            const mockVersionManager = {
                findVersion: vi.fn()
                    .mockReturnValueOnce({ version: mockFromVersion, projectId: 'project-1' })
                    .mockReturnValueOnce({ version: mockToVersion, projectId: 'project-2' }),
            };
            (getVersionManager as any).mockReturnValue(mockVersionManager);

            const request = new NextRequest('http://localhost/api/diff', {
                method: 'POST',
                body: JSON.stringify({
                    fromVersionId: 'v1',
                    toVersionId: 'v2',
                }),
            });

            const response = await POST(request);

            expect(AppError.state).toHaveBeenCalledWith(
                'VERSION_PROJECT_MISMATCH',
                'Requested versions belong to different projects',
                { fromProjectId: 'project-1', toProjectId: 'project-2' }
            );
            expect(apiHandleError).toHaveBeenCalled();
        });

        it('should compute diffs with timeout', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getVersionManager } = await import('../../../lib/core');
            const { getDiffEngine } = await import('../../../lib/diff');
            const { ComputeDiffRequestSchema } = await import('@ai-app-builder/shared/schemas');
            const { withTimeout } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (ComputeDiffRequestSchema.parse as any).mockReturnValue({
                fromVersionId: 'v1',
                toVersionId: 'v2',
                projectId: 'test-project',
            });
            
            const mockVersionManager = {
                getVersion: vi.fn()
                    .mockReturnValueOnce(mockFromVersion)
                    .mockReturnValueOnce(mockToVersion),
            };
            (getVersionManager as any).mockReturnValue(mockVersionManager);
            
            const mockDiffEngine = {
                computeDiffsFromFiles: vi.fn().mockResolvedValue(mockDiffs),
            };
            (getDiffEngine as any).mockReturnValue(mockDiffEngine);
            (withTimeout as any).mockImplementation((promise: any, options: any) => promise);

            const request = new NextRequest('http://localhost/api/diff', {
                method: 'POST',
                body: JSON.stringify({
                    fromVersionId: 'v1',
                    toVersionId: 'v2',
                    projectId: 'test-project',
                }),
            });

            await POST(request);

            expect(withTimeout).toHaveBeenCalledWith(
                expect.any(Promise),
                expect.objectContaining({
                    timeoutMs: 30000,
                    operationName: 'diff computation',
                })
            );
        });

        it('should handle timeout errors', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { ComputeDiffRequestSchema } = await import('@ai-app-builder/shared/schemas');
            const { withTimeout, TimeoutError, AppError, handleError: apiHandleError } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (ComputeDiffRequestSchema.parse as any).mockReturnValue({
                fromVersionId: 'v1',
                toVersionId: 'v2',
                projectId: 'test-project',
            });
            
            const timeoutError = new TimeoutError('Operation timed out', 30000);
            (withTimeout as any).mockRejectedValue(timeoutError);

            const request = new NextRequest('http://localhost/api/diff', {
                method: 'POST',
                body: JSON.stringify({
                    fromVersionId: 'v1',
                    toVersionId: 'v2',
                    projectId: 'test-project',
                }),
            });

            const response = await POST(request);

            expect(AppError.network).toHaveBeenCalledWith(
                'OPERATION_TIMEOUT',
                'Diff computation timed out after 30 seconds',
                { timeoutMs: 30000 },
                504
            );
            expect(apiHandleError).toHaveBeenCalled();
        });

        it('should return rate limit response when rate limited', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const rateLimitResponse = new Response('Too Many Requests', { status: 429 });
            (applyRateLimit as any).mockReturnValue(rateLimitResponse);

            const request = new NextRequest('http://localhost/api/diff', {
                method: 'POST',
                body: JSON.stringify({
                    fromVersionId: 'v1',
                    toVersionId: 'v2',
                    projectId: 'test-project',
                }),
            });

            const response = await POST(request);

            expect(response.status).toBe(429);
        });

        it('should include CORS headers in response', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getVersionManager } = await import('../../../lib/core');
            const { getDiffEngine } = await import('../../../lib/diff');
            const { ComputeDiffRequestSchema } = await import('@ai-app-builder/shared/schemas');
            const { withTimeout, getCorsHeaders } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (ComputeDiffRequestSchema.parse as any).mockReturnValue({
                fromVersionId: 'v1',
                toVersionId: 'v2',
                projectId: 'test-project',
            });
            
            const mockVersionManager = {
                getVersion: vi.fn()
                    .mockReturnValueOnce(mockFromVersion)
                    .mockReturnValueOnce(mockToVersion),
            };
            (getVersionManager as any).mockReturnValue(mockVersionManager);
            
            const mockDiffEngine = {
                computeDiffsFromFiles: vi.fn().mockResolvedValue(mockDiffs),
            };
            (getDiffEngine as any).mockReturnValue(mockDiffEngine);
            (withTimeout as any).mockResolvedValue(mockDiffs);
            
            const mockCorsHeaders = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            };
            (getCorsHeaders as any).mockReturnValue(mockCorsHeaders);

            const request = new NextRequest('http://localhost/api/diff', {
                method: 'POST',
                body: JSON.stringify({
                    fromVersionId: 'v1',
                    toVersionId: 'v2',
                    projectId: 'test-project',
                }),
            });

            const response = await POST(request);

            expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
        });
    });
});
