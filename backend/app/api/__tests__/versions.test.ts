import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, OPTIONS } from '../versions/route';

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
    withRouteContext: vi.fn().mockImplementation((_module: string, handler: any) => {
        return (request: any) => handler(
            { requestId: 'test-id', contextLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }, setRateLimitHeaders: vi.fn() },
            request
        );
    }),
}));

// Mock the core module
vi.mock('../../../lib/core', () => ({
    getVersionManager: vi.fn(),
}));

// Mock the shared module
vi.mock('@ai-app-builder/shared', () => ({
    GetVersionsRequestSchema: {
        parse: vi.fn(),
    },
    serializeVersion: vi.fn(),
}));

describe('Versions API Endpoint', () => {
    const mockVersions = [
        {
            id: 'v1',
            timestamp: '2024-01-01T00:00:00.000Z',
            description: 'Initial version',
            files: [],
        },
        {
            id: 'v2',
            timestamp: '2024-01-02T00:00:00.000Z',
            description: 'Second version',
            files: [],
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('OPTIONS /api/versions', () => {
        it('should return 204 status for OPTIONS request', async () => {
            const response = await OPTIONS();
            expect(response.status).toBe(204);
        });
    });

    describe('GET /api/versions', () => {
        it('should return 200 status with versions list', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getVersionManager } = await import('../../../lib/core');
            const { GetVersionsRequestSchema, serializeVersion } = await import('@ai-app-builder/shared');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (GetVersionsRequestSchema.parse as any).mockReturnValue({ projectId: 'test-project' });
            
            const mockVersionManager = {
                getAllVersions: vi.fn().mockReturnValue(mockVersions),
            };
            (getVersionManager as any).mockReturnValue(mockVersionManager);
            
            (serializeVersion as any).mockImplementation((v: any) => v);

            const request = new NextRequest('http://localhost/api/versions?projectId=test-project', {
                method: 'GET',
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.versions).toEqual(mockVersions);
            expect(mockVersionManager.getAllVersions).toHaveBeenCalledWith('test-project');
        });

        it('should use LOW_COST rate limit tier', async () => {
            const { applyRateLimit, RateLimitTier } = await import('../../../lib/security');
            const { GetVersionsRequestSchema } = await import('@ai-app-builder/shared');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (GetVersionsRequestSchema.parse as any).mockReturnValue({ projectId: 'test-project' });

            const request = new NextRequest('http://localhost/api/versions?projectId=test-project', {
                method: 'GET',
            });

            await GET(request);

            expect(applyRateLimit).toHaveBeenCalledWith(request, RateLimitTier.LOW_COST);
        });

        it('should parse projectId from query parameters', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getVersionManager } = await import('../../../lib/core');
            const { GetVersionsRequestSchema, serializeVersion } = await import('@ai-app-builder/shared');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (GetVersionsRequestSchema.parse as any).mockReturnValue({ projectId: 'my-project' });
            
            const mockVersionManager = {
                getAllVersions: vi.fn().mockReturnValue([]),
            };
            (getVersionManager as any).mockReturnValue(mockVersionManager);
            (serializeVersion as any).mockImplementation((v: any) => v);

            const request = new NextRequest('http://localhost/api/versions?projectId=my-project', {
                method: 'GET',
            });

            await GET(request);

            expect(GetVersionsRequestSchema.parse).toHaveBeenCalledWith({ projectId: 'my-project' });
            expect(mockVersionManager.getAllVersions).toHaveBeenCalledWith('my-project');
        });

        it('should return rate limit response when rate limited', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const rateLimitResponse = new Response('Too Many Requests', { status: 429 });
            (applyRateLimit as any).mockReturnValue(rateLimitResponse);

            const request = new NextRequest('http://localhost/api/versions?projectId=test-project', {
                method: 'GET',
            });

            const response = await GET(request);

            expect(response.status).toBe(429);
        });

        it('should handle validation errors from GetVersionsRequestSchema', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { GetVersionsRequestSchema } = await import('@ai-app-builder/shared');
            const { handleError: apiHandleError } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (GetVersionsRequestSchema.parse as any).mockImplementation(() => {
                throw new Error('Invalid projectId');
            });

            const request = new NextRequest('http://localhost/api/versions?projectId=invalid', {
                method: 'GET',
            });

            const response = await GET(request);

            expect(apiHandleError).toHaveBeenCalledWith(
                expect.any(Error),
                'api/versions',
                request
            );
        });

        it('should serialize versions for JSON transport', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getVersionManager } = await import('../../../lib/core');
            const { GetVersionsRequestSchema, serializeVersion } = await import('@ai-app-builder/shared');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (GetVersionsRequestSchema.parse as any).mockReturnValue({ projectId: 'test-project' });
            
            const mockVersionManager = {
                getAllVersions: vi.fn().mockReturnValue(mockVersions),
            };
            (getVersionManager as any).mockReturnValue(mockVersionManager);
            
            (serializeVersion as any).mockImplementation((version: any) => ({
                ...version,
                serialized: true,
            }));

            const request = new NextRequest('http://localhost/api/versions?projectId=test-project', {
                method: 'GET',
            });

            const response = await GET(request);
            const data = await response.json();

            expect(serializeVersion).toHaveBeenCalledTimes(mockVersions.length);
            expect(data.versions).toHaveLength(mockVersions.length);
            data.versions.forEach((version: any) => {
                expect(version.serialized).toBe(true);
            });
        });

        it('should include CORS headers in response', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getVersionManager } = await import('../../../lib/core');
            const { GetVersionsRequestSchema, serializeVersion } = await import('@ai-app-builder/shared');
            const { getCorsHeaders } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (GetVersionsRequestSchema.parse as any).mockReturnValue({ projectId: 'test-project' });
            
            const mockVersionManager = {
                getAllVersions: vi.fn().mockReturnValue([]),
            };
            (getVersionManager as any).mockReturnValue(mockVersionManager);
            (serializeVersion as any).mockImplementation((v: any) => v);
            
            const mockCorsHeaders = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            };
            (getCorsHeaders as any).mockReturnValue(mockCorsHeaders);

            const request = new NextRequest('http://localhost/api/versions?projectId=test-project', {
                method: 'GET',
            });

            const response = await GET(request);

            expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
        });

        it('should return empty array when no versions exist', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getVersionManager } = await import('../../../lib/core');
            const { GetVersionsRequestSchema, serializeVersion } = await import('@ai-app-builder/shared');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (GetVersionsRequestSchema.parse as any).mockReturnValue({ projectId: 'new-project' });
            
            const mockVersionManager = {
                getAllVersions: vi.fn().mockReturnValue([]),
            };
            (getVersionManager as any).mockReturnValue(mockVersionManager);
            (serializeVersion as any).mockImplementation((v: any) => v);

            const request = new NextRequest('http://localhost/api/versions?projectId=new-project', {
                method: 'GET',
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.versions).toEqual([]);
            expect(data.versions).toHaveLength(0);
        });
    });
});
