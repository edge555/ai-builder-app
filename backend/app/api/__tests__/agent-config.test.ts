import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PUT, OPTIONS } from '../agent-config/route';

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

// Mock the agent-config-store
vi.mock('../../../lib/ai/agent-config-store', () => ({
    load: vi.fn(),
    save: vi.fn(),
}));

describe('Agent Config API Endpoint', () => {
    const mockConfig = {
        version: 1 as const,
        tasks: {
            intent: {
                taskType: 'intent' as const,
                models: [
                    { id: 'gpt-4', label: 'GPT-4', active: true, priority: 0 },
                    { id: 'claude-3', label: 'Claude 3', active: false, priority: 1 },
                ],
            },
            planning: {
                taskType: 'planning' as const,
                models: [
                    { id: 'gpt-4', label: 'GPT-4', active: true, priority: 0 },
                ],
            },
            execution: {
                taskType: 'execution' as const,
                models: [
                    { id: 'gpt-4', label: 'GPT-4', active: true, priority: 0 },
                    { id: 'claude-3', label: 'Claude 3', active: true, priority: 1 },
                ],
            },
            bugfix: {
                taskType: 'bugfix' as const,
                models: [
                    { id: 'gpt-4', label: 'GPT-4', active: true, priority: 0 },
                ],
            },
            review: {
                taskType: 'review' as const,
                models: [
                    { id: 'gpt-4', label: 'GPT-4', active: true, priority: 0 },
                ],
            },
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('OPTIONS /api/agent-config', () => {
        it('should return 204 status for OPTIONS request', async () => {
            const response = await OPTIONS();
            expect(response.status).toBe(204);
        });
    });

    describe('GET /api/agent-config', () => {
        it('should return 200 status with agent config', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { load } = await import('../../../lib/ai/agent-config-store');
            
            vi.mocked(applyRateLimit).mockResolvedValue({ blocked: null, headers: {} });
            vi.mocked(load).mockResolvedValue(mockConfig);

            const request = new NextRequest('http://localhost/api/agent-config', {
                method: 'GET',
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toEqual(mockConfig);
        });

        it('should use CONFIG rate limit tier', async () => {
            const { applyRateLimit, RateLimitTier } = await import('../../../lib/security');
            const { load } = await import('../../../lib/ai/agent-config-store');
            
            vi.mocked(applyRateLimit).mockResolvedValue({ blocked: null, headers: {} });
            vi.mocked(load).mockResolvedValue(mockConfig);

            const request = new NextRequest('http://localhost/api/agent-config', {
                method: 'GET',
            });

            await GET(request);

            expect(applyRateLimit).toHaveBeenCalledWith(request, RateLimitTier.CONFIG);
        });

        it('should return rate limit response when rate limited', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const rateLimitResponse = new Response('Too Many Requests', { status: 429 });
            vi.mocked(applyRateLimit).mockResolvedValue({ blocked: rateLimitResponse, headers: {} });

            const request = new NextRequest('http://localhost/api/agent-config', {
                method: 'GET',
            });

            const response = await GET(request);

            expect(response.status).toBe(429);
        });

        it('should handle errors from load function', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { load } = await import('../../../lib/ai/agent-config-store');
            const { handleError: apiHandleError } = await import('../../../lib/api');
            
            vi.mocked(applyRateLimit).mockResolvedValue({ blocked: null, headers: {} });
            vi.mocked(load).mockRejectedValue(new Error('Failed to load config'));

            const request = new NextRequest('http://localhost/api/agent-config', {
                method: 'GET',
            });

            const response = await GET(request);

            expect(apiHandleError).toHaveBeenCalledWith(
                expect.any(Error),
                'api/agent-config GET',
                request
            );
        });

        it('should include CORS headers in response', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { load } = await import('../../../lib/ai/agent-config-store');
            const { getCorsHeaders } = await import('../../../lib/api');
            
            vi.mocked(applyRateLimit).mockResolvedValue({ blocked: null, headers: {} });
            vi.mocked(load).mockResolvedValue(mockConfig);
            
            const mockCorsHeaders = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            };
            vi.mocked(getCorsHeaders).mockReturnValue(mockCorsHeaders);

            const request = new NextRequest('http://localhost/api/agent-config', {
                method: 'GET',
            });

            const response = await GET(request);

            expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
        });
    });

    describe('PUT /api/agent-config', () => {
        it('should return 200 status with saved config', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { save } = await import('../../../lib/ai/agent-config-store');
            
            vi.mocked(applyRateLimit).mockResolvedValue({ blocked: null, headers: {} });
            vi.mocked(save).mockResolvedValue(undefined);

            const request = new NextRequest('http://localhost/api/agent-config', {
                method: 'PUT',
                body: JSON.stringify(mockConfig),
            });

            const response = await PUT(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toEqual(mockConfig);
        });

        it('should use CONFIG rate limit tier', async () => {
            const { applyRateLimit, RateLimitTier } = await import('../../../lib/security');
            const { save } = await import('../../../lib/ai/agent-config-store');
            
            vi.mocked(applyRateLimit).mockResolvedValue({ blocked: null, headers: {} });
            vi.mocked(save).mockResolvedValue(undefined);

            const request = new NextRequest('http://localhost/api/agent-config', {
                method: 'PUT',
                body: JSON.stringify(mockConfig),
            });

            await PUT(request);

            expect(applyRateLimit).toHaveBeenCalledWith(request, RateLimitTier.CONFIG);
        });

        it('should return 400 when request body fails schema validation', async () => {
            const { applyRateLimit } = await import('../../../lib/security');

            vi.mocked(applyRateLimit).mockResolvedValue({ blocked: null, headers: {} });

            const invalidConfig = {
                version: 2, // Invalid version (schema expects literal 1)
                tasks: {},
            };

            const request = new NextRequest('http://localhost/api/agent-config', {
                method: 'PUT',
                body: JSON.stringify(invalidConfig),
            });

            const response = await PUT(request);

            expect(response.status).toBe(400);
        });

        it('should return 400 when required task types are missing', async () => {
            const { applyRateLimit } = await import('../../../lib/security');

            vi.mocked(applyRateLimit).mockResolvedValue({ blocked: null, headers: {} });

            const incompleteConfig = {
                version: 1,
                tasks: {
                    intent: { taskType: 'intent', models: [] },
                    // Missing planning, execution, bugfix, review
                },
            };

            const request = new NextRequest('http://localhost/api/agent-config', {
                method: 'PUT',
                body: JSON.stringify(incompleteConfig),
            });

            const response = await PUT(request);

            expect(response.status).toBe(400);
        });

        it('should return 400 when model entry has empty id', async () => {
            const { applyRateLimit } = await import('../../../lib/security');

            vi.mocked(applyRateLimit).mockResolvedValue({ blocked: null, headers: {} });

            const invalidModelConfig = {
                version: 1,
                tasks: {
                    intent: { taskType: 'intent', models: [{ id: '', label: 'Test', active: true, priority: 0 }] },
                    planning: { taskType: 'planning', models: [] },
                    execution: { taskType: 'execution', models: [] },
                    bugfix: { taskType: 'bugfix', models: [] },
                    review: { taskType: 'review', models: [] },
                },
            };

            const request = new NextRequest('http://localhost/api/agent-config', {
                method: 'PUT',
                body: JSON.stringify(invalidModelConfig),
            });

            const response = await PUT(request);

            expect(response.status).toBe(400);
        });

        it('should handle save errors', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { save } = await import('../../../lib/ai/agent-config-store');
            const { handleError: apiHandleError } = await import('../../../lib/api');
            
            vi.mocked(applyRateLimit).mockResolvedValue({ blocked: null, headers: {} });
            vi.mocked(save).mockRejectedValue(new Error('Failed to save config'));

            const request = new NextRequest('http://localhost/api/agent-config', {
                method: 'PUT',
                body: JSON.stringify(mockConfig),
            });

            const response = await PUT(request);

            expect(apiHandleError).toHaveBeenCalledWith(
                expect.any(Error),
                'api/agent-config PUT',
                request
            );
        });

        it('should return rate limit response when rate limited', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const rateLimitResponse = new Response('Too Many Requests', { status: 429 });
            vi.mocked(applyRateLimit).mockResolvedValue({ blocked: rateLimitResponse, headers: {} });

            const request = new NextRequest('http://localhost/api/agent-config', {
                method: 'PUT',
                body: JSON.stringify(mockConfig),
            });

            const response = await PUT(request);

            expect(response.status).toBe(429);
        });
    });
});
