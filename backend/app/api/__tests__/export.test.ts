import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, OPTIONS } from '../export/route';

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
    exportAsZipBuffer: vi.fn(),
}));

// Mock the shared module
vi.mock('@ai-app-builder/shared', () => ({
    ExportProjectRequestSchema: {
        parse: vi.fn(),
    },
    deserializeProjectState: vi.fn(),
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

describe('Export API Endpoint', () => {
    const mockProjectState = {
        name: 'Test Project',
        files: [
            {
                path: 'index.js',
                content: 'console.log("Hello");',
            },
        ],
    };

    const mockZipBuffer = Buffer.from('mock-zip-content');

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('OPTIONS /api/export', () => {
        it('should return 204 status for OPTIONS request', async () => {
            const response = await OPTIONS();
            expect(response.status).toBe(204);
        });
    });

    describe('POST /api/export', () => {
        it('should return 200 status with ZIP file', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { ExportProjectRequestSchema, deserializeProjectState } = await import('@ai-app-builder/shared');
            const { exportAsZipBuffer } = await import('../../../lib/core');
            const { withTimeout } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (ExportProjectRequestSchema.parse as any).mockReturnValue({
                projectState: mockProjectState,
            });
            (deserializeProjectState as any).mockReturnValue(mockProjectState);
            (exportAsZipBuffer as any).mockResolvedValue(mockZipBuffer);
            (withTimeout as any).mockResolvedValue(mockZipBuffer);

            const request = new NextRequest('http://localhost/api/export', {
                method: 'POST',
                body: JSON.stringify({ projectState: mockProjectState }),
            });

            const response = await POST(request);

            expect(response.status).toBe(200);
            expect(response.headers.get('Content-Type')).toBe('application/zip');
            expect(response.headers.get('Content-Disposition')).toContain('attachment');
            expect(response.headers.get('Content-Length')).toBe(mockZipBuffer.length.toString());
        });

        it('should use LOW_COST rate limit tier', async () => {
            const { applyRateLimit, RateLimitTier } = await import('../../../lib/security');
            const { ExportProjectRequestSchema } = await import('@ai-app-builder/shared');
            const { withTimeout } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (ExportProjectRequestSchema.parse as any).mockReturnValue({
                projectState: mockProjectState,
            });
            (withTimeout as any).mockResolvedValue(mockZipBuffer);

            const request = new NextRequest('http://localhost/api/export', {
                method: 'POST',
                body: JSON.stringify({ projectState: mockProjectState }),
            });

            await POST(request);

            expect(applyRateLimit).toHaveBeenCalledWith(request, RateLimitTier.LOW_COST);
        });

        it('should validate request body against schema', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { ExportProjectRequestSchema } = await import('@ai-app-builder/shared');
            const { handleError: apiHandleError } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (ExportProjectRequestSchema.parse as any).mockImplementation(() => {
                throw new Error('Invalid project state');
            });

            const request = new NextRequest('http://localhost/api/export', {
                method: 'POST',
                body: JSON.stringify({ invalid: 'data' }),
            });

            const response = await POST(request);

            expect(apiHandleError).toHaveBeenCalledWith(
                expect.any(Error),
                'api/export',
                request
            );
        });

        it('should deserialize project state', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { ExportProjectRequestSchema, deserializeProjectState } = await import('@ai-app-builder/shared');
            const { withTimeout } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (ExportProjectRequestSchema.parse as any).mockReturnValue({
                projectState: mockProjectState,
            });
            (deserializeProjectState as any).mockReturnValue(mockProjectState);
            (withTimeout as any).mockResolvedValue(mockZipBuffer);

            const request = new NextRequest('http://localhost/api/export', {
                method: 'POST',
                body: JSON.stringify({ projectState: mockProjectState }),
            });

            await POST(request);

            expect(deserializeProjectState).toHaveBeenCalledWith(mockProjectState);
        });

        it('should generate ZIP file with timeout', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { ExportProjectRequestSchema, deserializeProjectState } = await import('@ai-app-builder/shared');
            const { exportAsZipBuffer } = await import('../../../lib/core');
            const { withTimeout } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (ExportProjectRequestSchema.parse as any).mockReturnValue({
                projectState: mockProjectState,
            });
            (deserializeProjectState as any).mockReturnValue(mockProjectState);
            (exportAsZipBuffer as any).mockResolvedValue(mockZipBuffer);
            (withTimeout as any).mockImplementation((promise: any, options: any) => promise);

            const request = new NextRequest('http://localhost/api/export', {
                method: 'POST',
                body: JSON.stringify({ projectState: mockProjectState }),
            });

            await POST(request);

            expect(withTimeout).toHaveBeenCalledWith(
                expect.any(Promise),
                expect.objectContaining({
                    timeoutMs: 60000,
                    operationName: 'project export',
                })
            );
        });

        it('should sanitize project name for filename', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { ExportProjectRequestSchema, deserializeProjectState } = await import('@ai-app-builder/shared');
            const { exportAsZipBuffer } = await import('../../../lib/core');
            const { withTimeout } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (ExportProjectRequestSchema.parse as any).mockReturnValue({
                projectState: mockProjectState,
            });
            (deserializeProjectState as any).mockReturnValue(mockProjectState);
            (exportAsZipBuffer as any).mockResolvedValue(mockZipBuffer);
            (withTimeout as any).mockResolvedValue(mockZipBuffer);

            const request = new NextRequest('http://localhost/api/export', {
                method: 'POST',
                body: JSON.stringify({ projectState: mockProjectState }),
            });

            const response = await POST(request);

            const contentDisposition = response.headers.get('Content-Disposition');
            expect(contentDisposition).toContain('test-project.zip');
        });

        it('should handle special characters in project name', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { ExportProjectRequestSchema, deserializeProjectState } = await import('@ai-app-builder/shared');
            const { exportAsZipBuffer } = await import('../../../lib/core');
            const { withTimeout } = await import('../../../lib/api');
            
            const specialNameProject = {
                ...mockProjectState,
                name: 'My Test Project!!!',
            };

            (applyRateLimit as any).mockReturnValue(null);
            (ExportProjectRequestSchema.parse as any).mockReturnValue({
                projectState: specialNameProject,
            });
            (deserializeProjectState as any).mockReturnValue(specialNameProject);
            (exportAsZipBuffer as any).mockResolvedValue(mockZipBuffer);
            (withTimeout as any).mockResolvedValue(mockZipBuffer);

            const request = new NextRequest('http://localhost/api/export', {
                method: 'POST',
                body: JSON.stringify({ projectState: specialNameProject }),
            });

            const response = await POST(request);

            const contentDisposition = response.headers.get('Content-Disposition');
            expect(contentDisposition).toContain('my-test-project.zip');
        });

        it('should return rate limit response when rate limited', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const rateLimitResponse = new Response('Too Many Requests', { status: 429 });
            (applyRateLimit as any).mockReturnValue(rateLimitResponse);

            const request = new NextRequest('http://localhost/api/export', {
                method: 'POST',
                body: JSON.stringify({ projectState: mockProjectState }),
            });

            const response = await POST(request);

            expect(response.status).toBe(429);
        });

        it('should handle timeout errors', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { ExportProjectRequestSchema, deserializeProjectState } = await import('@ai-app-builder/shared');
            const { withTimeout, TimeoutError, AppError, handleError: apiHandleError } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (ExportProjectRequestSchema.parse as any).mockReturnValue({
                projectState: mockProjectState,
            });
            (deserializeProjectState as any).mockReturnValue(mockProjectState);
            
            const timeoutError = new TimeoutError('Operation timed out', 60000);
            (withTimeout as any).mockRejectedValue(timeoutError);

            const request = new NextRequest('http://localhost/api/export', {
                method: 'POST',
                body: JSON.stringify({ projectState: mockProjectState }),
            });

            const response = await POST(request);

            expect(AppError.network).toHaveBeenCalledWith(
                'OPERATION_TIMEOUT',
                'Project export timed out after 60 seconds',
                { timeoutMs: 60000 },
                504
            );
            expect(apiHandleError).toHaveBeenCalled();
        });

        it('should include CORS headers in response', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { ExportProjectRequestSchema, deserializeProjectState } = await import('@ai-app-builder/shared');
            const { exportAsZipBuffer } = await import('../../../lib/core');
            const { withTimeout, getCorsHeaders } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (ExportProjectRequestSchema.parse as any).mockReturnValue({
                projectState: mockProjectState,
            });
            (deserializeProjectState as any).mockReturnValue(mockProjectState);
            (exportAsZipBuffer as any).mockResolvedValue(mockZipBuffer);
            (withTimeout as any).mockResolvedValue(mockZipBuffer);
            
            const mockCorsHeaders = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            };
            (getCorsHeaders as any).mockReturnValue(mockCorsHeaders);

            const request = new NextRequest('http://localhost/api/export', {
                method: 'POST',
                body: JSON.stringify({ projectState: mockProjectState }),
            });

            const response = await POST(request);

            expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
        });
    });
});
