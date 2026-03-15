import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PUT, OPTIONS } from '../provider-config/route';

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
            { requestId: 'test-id', contextLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } },
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

// Mock the provider-config-store
vi.mock('../../../lib/ai/provider-config-store', () => ({
    getProviderConfigWithSource: vi.fn(),
    saveProvider: vi.fn(),
}));

// Mock the ai-provider-factory
vi.mock('../../../lib/ai/ai-provider-factory', () => ({
    resetProviderSingletons: vi.fn(),
}));

describe('Provider Config API Endpoint', () => {
    const mockConfig = {
        provider: 'openrouter',
        source: 'env',
        envProvider: 'openrouter',
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('OPTIONS /api/provider-config', () => {
        it('should return 204 status for OPTIONS request', async () => {
            const response = await OPTIONS();
            expect(response.status).toBe(204);
        });
    });

    describe('GET /api/provider-config', () => {
        it('should return 200 status with provider config', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getProviderConfigWithSource } = await import('../../../lib/ai/provider-config-store');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (getProviderConfigWithSource as any).mockResolvedValue(mockConfig);

            const request = new NextRequest('http://localhost/api/provider-config', {
                method: 'GET',
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toEqual(mockConfig);
        });

        it('should use CONFIG rate limit tier', async () => {
            const { applyRateLimit, RateLimitTier } = await import('../../../lib/security');
            const { getProviderConfigWithSource } = await import('../../../lib/ai/provider-config-store');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (getProviderConfigWithSource as any).mockResolvedValue(mockConfig);

            const request = new NextRequest('http://localhost/api/provider-config', {
                method: 'GET',
            });

            await GET(request);

            expect(applyRateLimit).toHaveBeenCalledWith(request, RateLimitTier.CONFIG);
        });

        it('should return rate limit response when rate limited', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const rateLimitResponse = new Response('Too Many Requests', { status: 429 });
            (applyRateLimit as any).mockReturnValue(rateLimitResponse);

            const request = new NextRequest('http://localhost/api/provider-config', {
                method: 'GET',
            });

            const response = await GET(request);

            expect(response.status).toBe(429);
        });

        it('should handle errors from getProviderConfigWithSource function', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getProviderConfigWithSource } = await import('../../../lib/ai/provider-config-store');
            const { handleError: apiHandleError } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (getProviderConfigWithSource as any).mockRejectedValue(new Error('Failed to load config'));

            const request = new NextRequest('http://localhost/api/provider-config', {
                method: 'GET',
            });

            const response = await GET(request);

            expect(apiHandleError).toHaveBeenCalledWith(
                expect.any(Error),
                'api/provider-config GET',
                request
            );
        });

        it('should include CORS headers in response', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getProviderConfigWithSource } = await import('../../../lib/ai/provider-config-store');
            const { getCorsHeaders } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (getProviderConfigWithSource as any).mockResolvedValue(mockConfig);
            
            const mockCorsHeaders = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            };
            (getCorsHeaders as any).mockReturnValue(mockCorsHeaders);

            const request = new NextRequest('http://localhost/api/provider-config', {
                method: 'GET',
            });

            const response = await GET(request);

            expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
        });
    });

    describe('PUT /api/provider-config', () => {
        it('should return 200 status with saved config', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getProviderConfigWithSource, saveProvider } = await import('../../../lib/ai/provider-config-store');
            const { resetProviderSingletons } = await import('../../../lib/ai/ai-provider-factory');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (saveProvider as any).mockResolvedValue(undefined);
            (resetProviderSingletons as any).mockReturnValue(undefined);
            (getProviderConfigWithSource as any).mockResolvedValue(mockConfig);

            const requestBody = { aiProvider: 'openrouter' };
            const request = new NextRequest('http://localhost/api/provider-config', {
                method: 'PUT',
                body: JSON.stringify(requestBody),
            });

            const response = await PUT(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toEqual(mockConfig);
            expect(saveProvider).toHaveBeenCalledWith('openrouter');
            expect(resetProviderSingletons).toHaveBeenCalled();
        });

        it('should use CONFIG rate limit tier', async () => {
            const { applyRateLimit, RateLimitTier } = await import('../../../lib/security');
            const { saveProvider, getProviderConfigWithSource } = await import('../../../lib/ai/provider-config-store');
            const { resetProviderSingletons } = await import('../../../lib/ai/ai-provider-factory');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (saveProvider as any).mockResolvedValue(undefined);
            (resetProviderSingletons as any).mockReturnValue(undefined);
            (getProviderConfigWithSource as any).mockResolvedValue(mockConfig);

            const requestBody = { aiProvider: 'openrouter' };
            const request = new NextRequest('http://localhost/api/provider-config', {
                method: 'PUT',
                body: JSON.stringify(requestBody),
            });

            await PUT(request);

            expect(applyRateLimit).toHaveBeenCalledWith(request, RateLimitTier.CONFIG);
        });

        it('should validate aiProvider enum values', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { saveProvider } = await import('../../../lib/ai/provider-config-store');

            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });

            const invalidRequestBody = { aiProvider: 'invalid-provider' };
            const request = new NextRequest('http://localhost/api/provider-config', {
                method: 'PUT',
                body: JSON.stringify(invalidRequestBody),
            });

            const response = await PUT(request);

            expect(response.status).toBe(400);
            expect(saveProvider).not.toHaveBeenCalled();
        });

        it('should accept null aiProvider to use env default', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getProviderConfigWithSource, saveProvider } = await import('../../../lib/ai/provider-config-store');
            const { resetProviderSingletons } = await import('../../../lib/ai/ai-provider-factory');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (saveProvider as any).mockResolvedValue(undefined);
            (resetProviderSingletons as any).mockReturnValue(undefined);
            (getProviderConfigWithSource as any).mockResolvedValue(mockConfig);

            const requestBody = { aiProvider: null };
            const request = new NextRequest('http://localhost/api/provider-config', {
                method: 'PUT',
                body: JSON.stringify(requestBody),
            });

            const response = await PUT(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(saveProvider).toHaveBeenCalledWith(null);
        });

        it('should handle save errors', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { saveProvider } = await import('../../../lib/ai/provider-config-store');
            const { handleError: apiHandleError } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });
            (saveProvider as any).mockRejectedValue(new Error('Failed to save config'));

            const requestBody = { aiProvider: 'openrouter' };
            const request = new NextRequest('http://localhost/api/provider-config', {
                method: 'PUT',
                body: JSON.stringify(requestBody),
            });

            const response = await PUT(request);

            expect(apiHandleError).toHaveBeenCalledWith(
                expect.any(Error),
                'api/provider-config PUT',
                request
            );
        });

        it('should return rate limit response when rate limited', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const rateLimitResponse = new Response('Too Many Requests', { status: 429 });
            (applyRateLimit as any).mockReturnValue(rateLimitResponse);

            const requestBody = { aiProvider: 'openrouter' };
            const request = new NextRequest('http://localhost/api/provider-config', {
                method: 'PUT',
                body: JSON.stringify(requestBody),
            });

            const response = await PUT(request);

            expect(response.status).toBe(429);
        });

        it('should handle invalid JSON in request body', async () => {
            const { applyRateLimit } = await import('../../../lib/security');

            (applyRateLimit as any).mockReturnValue({ blocked: null, headers: {} });

            const request = new NextRequest('http://localhost/api/provider-config', {
                method: 'PUT',
                body: 'invalid json',
            });

            const response = await PUT(request);

            expect(response.status).toBe(400);
        });
    });
});
