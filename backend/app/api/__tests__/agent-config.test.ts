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
}));

// Mock the agent-config-store
vi.mock('../../../lib/ai/agent-config-store', () => ({
    load: vi.fn(),
    save: vi.fn(),
}));

describe('Agent Config API Endpoint', () => {
    const mockConfig = {
        version: 1,
        tasks: {
            intent: {
                taskType: 'intent',
                models: [
                    { id: 'gpt-4', label: 'GPT-4', active: true, priority: 0 },
                    { id: 'claude-3', label: 'Claude 3', active: false, priority: 1 },
                ],
            },
            planning: {
                taskType: 'planning',
                models: [
                    { id: 'gpt-4', label: 'GPT-4', active: true, priority: 0 },
                ],
            },
            coding: {
                taskType: 'coding',
                models: [
                    { id: 'gpt-4', label: 'GPT-4', active: true, priority: 0 },
                    { id: 'claude-3', label: 'Claude 3', active: true, priority: 1 },
                ],
            },
            debugging: {
                taskType: 'debugging',
                models: [
                    { id: 'gpt-4', label: 'GPT-4', active: true, priority: 0 },
                ],
            },
            documentation: {
                taskType: 'documentation',
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
            
            (applyRateLimit as any).mockReturnValue(null);
            (load as any).mockResolvedValue(mockConfig);

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
            
            (applyRateLimit as any).mockReturnValue(null);
            (load as any).mockResolvedValue(mockConfig);

            const request = new NextRequest('http://localhost/api/agent-config', {
                method: 'GET',
            });

            await GET(request);

            expect(applyRateLimit).toHaveBeenCalledWith(request, RateLimitTier.CONFIG);
        });

        it('should return rate limit response when rate limited', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const rateLimitResponse = new Response('Too Many Requests', { status: 429 });
            (applyRateLimit as any).mockReturnValue(rateLimitResponse);

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
            
            (applyRateLimit as any).mockReturnValue(null);
            (load as any).mockRejectedValue(new Error('Failed to load config'));

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
            
            (applyRateLimit as any).mockReturnValue(null);
            (load as any).mockResolvedValue(mockConfig);
            
            const mockCorsHeaders = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            };
            (getCorsHeaders as any).mockReturnValue(mockCorsHeaders);

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
            
            (applyRateLimit as any).mockReturnValue(null);
            (save as any).mockResolvedValue(undefined);

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
            
            (applyRateLimit as any).mockReturnValue(null);
            (save as any).mockResolvedValue(undefined);

            const request = new NextRequest('http://localhost/api/agent-config', {
                method: 'PUT',
                body: JSON.stringify(mockConfig),
            });

            await PUT(request);

            expect(applyRateLimit).toHaveBeenCalledWith(request, RateLimitTier.CONFIG);
        });

        it('should validate request body against schema', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { save } = await import('../../../lib/ai/agent-config-store');
            const { handleError: apiHandleError } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (save as any).mockResolvedValue(undefined);

            const invalidConfig = {
                version: 2, // Invalid version
                tasks: {},
            };

            const request = new NextRequest('http://localhost/api/agent-config', {
                method: 'PUT',
                body: JSON.stringify(invalidConfig),
            });

            const response = await PUT(request);

            // Should handle Zod validation error
            expect(apiHandleError).toHaveBeenCalled();
        });

        it('should require all task types in config', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { save } = await import('../../../lib/ai/agent-config-store');
            const { handleError: apiHandleError } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (save as any).mockResolvedValue(undefined);

            const incompleteConfig = {
                version: 1,
                tasks: {
                    intent: {
                        taskType: 'intent',
                        models: [],
                    },
                    // Missing other task types
                },
            };

            const request = new NextRequest('http://localhost/api/agent-config', {
                method: 'PUT',
                body: JSON.stringify(incompleteConfig),
            });

            const response = await PUT(request);

            expect(apiHandleError).toHaveBeenCalled();
        });

        it('should validate model entry structure', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { save } = await import('../../../lib/ai/agent-config-store');
            const { handleError: apiHandleError } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (save as any).mockResolvedValue(undefined);

            const invalidModelConfig = {
                version: 1,
                tasks: {
                    intent: {
                        taskType: 'intent',
                        models: [
                            { id: '', label: 'Test', active: true, priority: 0 }, // Empty id
                        ],
                    },
                    planning: {
                        taskType: 'planning',
                        models: [],
                    },
                    coding: {
                        taskType: 'coding',
                        models: [],
                    },
                    debugging: {
                        taskType: 'debugging',
                        models: [],
                    },
                    documentation: {
                        taskType: 'documentation',
                        models: [],
                    },
                },
            };

            const request = new NextRequest('http://localhost/api/agent-config', {
                method: 'PUT',
                body: JSON.stringify(invalidModelConfig),
            });

            const response = await PUT(request);

            expect(apiHandleError).toHaveBeenCalled();
        });

        it('should handle save errors', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { save } = await import('../../../lib/ai/agent-config-store');
            const { handleError: apiHandleError } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            (save as any).mockRejectedValue(new Error('Failed to save config'));

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
            (applyRateLimit as any).mockReturnValue(rateLimitResponse);

            const request = new NextRequest('http://localhost/api/agent-config', {
                method: 'PUT',
                body: JSON.stringify(mockConfig),
            });

            const response = await PUT(request);

            expect(response.status).toBe(429);
        });
    });
});
