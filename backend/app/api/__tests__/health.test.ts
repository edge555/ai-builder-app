import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, OPTIONS } from '../health/route';

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
}));

describe('Health API Endpoint', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('OPTIONS /api/health', () => {
        it('should return 204 status for OPTIONS request', async () => {
            const response = await OPTIONS();
            expect(response.status).toBe(204);
        });
    });

    describe('GET /api/health', () => {
        it('should return 200 status with health check data', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            (applyRateLimit as any).mockReturnValue(null);

            const request = new NextRequest('http://localhost/api/health', {
                method: 'GET',
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.status).toBe('ok');
            expect(data.timestamp).toBeDefined();
            expect(typeof data.timestamp).toBe('string');
        });

        it('should include CORS headers in response', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const { getCorsHeaders } = await import('../../../lib/api');
            
            (applyRateLimit as any).mockReturnValue(null);
            const mockCorsHeaders = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            };
            (getCorsHeaders as any).mockReturnValue(mockCorsHeaders);

            const request = new NextRequest('http://localhost/api/health', {
                method: 'GET',
            });

            const response = await GET(request);

            expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
            expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
            expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
        });

        it('should return rate limit response when rate limited', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            const rateLimitResponse = new Response('Too Many Requests', { status: 429 });
            (applyRateLimit as any).mockReturnValue(rateLimitResponse);

            const request = new NextRequest('http://localhost/api/health', {
                method: 'GET',
            });

            const response = await GET(request);

            expect(response.status).toBe(429);
        });

        it('should use LOW_COST rate limit tier', async () => {
            const { applyRateLimit, RateLimitTier } = await import('../../../lib/security');
            (applyRateLimit as any).mockReturnValue(null);

            const request = new NextRequest('http://localhost/api/health', {
                method: 'GET',
            });

            await GET(request);

            expect(applyRateLimit).toHaveBeenCalledWith(request, RateLimitTier.LOW_COST);
        });

        it('should return ISO 8601 formatted timestamp', async () => {
            const { applyRateLimit } = await import('../../../lib/security');
            (applyRateLimit as any).mockReturnValue(null);

            const request = new NextRequest('http://localhost/api/health', {
                method: 'GET',
            });

            const response = await GET(request);
            const data = await response.json();

            // Verify timestamp is in ISO 8601 format
            const date = new Date(data.timestamp);
            expect(date.toISOString()).toBe(data.timestamp);
            expect(isNaN(date.getTime())).toBe(false);
        });
    });
});
