import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as generatePOST } from '../generate/route';
import { POST as modifyPOST } from '../modify/route';
import { createStreamingProjectGenerator } from '../../../lib/core/streaming-generator';
import { createModificationEngine } from '../../../lib/diff';
import { requireAuth } from '../../../lib/security/auth';
import { resolveWorkspaceProvider } from '../../../lib/security/workspace-resolver';
import { config } from '../../../lib/config';

// Mock the services
vi.mock('../../../lib/core/streaming-generator', () => ({
    createStreamingProjectGenerator: vi.fn(),
}));

vi.mock('../../../lib/diff', () => ({
    createModificationEngine: vi.fn(),
}));

vi.mock('../../../lib/security', () => ({
    applyRateLimit: vi.fn(async () => ({ blocked: null, headers: {} })),
    RateLimitTier: {
        HIGH_COST: 'HIGH_COST',
        MEDIUM_COST: 'MEDIUM_COST',
        LOW_COST: 'LOW_COST',
        CONFIG: 'CONFIG',
    },
}));

vi.mock('../../../lib/security/auth', () => ({
    requireAuth: vi.fn(),
}));

vi.mock('../../../lib/security/workspace-resolver', () => ({
    resolveWorkspaceProvider: vi.fn(),
}));

describe('API Integration Tests', () => {
    const allowedOrigin = config.cors.allowedOrigins[0] ?? 'http://localhost:8080';
    const requestHeaders = {
        origin: allowedOrigin,
        'accept-encoding': 'identity',
    };
    const projectState = {
        id: 'p1',
        name: 'test-project',
        description: 'test',
        files: { 'src/App.tsx': 'export default function App(){ return null; }' },
        createdAt: new Date(),
        updatedAt: new Date(),
        currentVersionId: 'v1',
    };
    const serializedProjectState = {
        ...projectState,
        createdAt: projectState.createdAt.toISOString(),
        updatedAt: projectState.updatedAt.toISOString(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('POST /api/generate', () => {
        it('should return 201 on successful generation', async () => {
            const mockVersion = {
                id: 'v1',
                projectId: 'p1',
                prompt: 'A test project',
                timestamp: new Date(),
                files: {},
                diffs: [],
                parentVersionId: null,
            };

            vi.mocked(createStreamingProjectGenerator).mockReturnValue({
                generateProjectStreaming: vi.fn().mockResolvedValue({
                    success: true,
                    projectState,
                    version: mockVersion,
                }),
            });

            const request = new NextRequest('http://localhost/api/generate', {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify({ description: 'A test project' }),
            });

            const response = await generatePOST(request);
            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data.success).toBe(true);
            expect(data.projectState).toBeDefined();
        });

        it('should return 400 on invalid request', async () => {
            const request = new NextRequest('http://localhost/api/generate', {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify({}), // Missing description
            });

            const response = await generatePOST(request);
            expect(response.status).toBe(400);
        });

        it('returns 403 with CORS headers when workspace membership is forbidden', async () => {
            vi.mocked(requireAuth).mockResolvedValue({ userId: 'user-1' } as never);
            vi.mocked(resolveWorkspaceProvider).mockResolvedValue({ forbidden: true } as never);

            const request = new NextRequest('http://localhost/api/generate', {
                method: 'POST',
                headers: {
                    ...requestHeaders,
                },
                body: JSON.stringify({
                    description: 'A test project',
                    workspaceId: '11111111-1111-4111-8111-111111111111',
                }),
            });

            const response = await generatePOST(request);
            const text = await response.text();

            expect(response.status).toBe(403);
            expect(text).toContain('Not a member of this workspace');
            expect(response.headers.get('Access-Control-Allow-Origin')).toBe(allowedOrigin);
            expect(response.headers.get('Content-Type')).toContain('application/json');
            expect(response.headers.get('X-Request-Id')).toBeTruthy();
        });
    });

    describe('POST /api/modify', () => {
        it('should return 200 on successful modification', async () => {
            const mockVersion = {
                id: 'v2',
                projectId: 'p1',
                prompt: 'Add a new file',
                timestamp: new Date(),
                files: {},
                diffs: [],
                parentVersionId: 'v1',
            };

            vi.mocked(createModificationEngine).mockReturnValue({
                modifyProject: vi.fn().mockResolvedValue({
                    success: true,
                    projectState,
                    version: mockVersion,
                    diffs: [],
                    changeSummary: 'Modified files',
                }),
            });

            const request = new NextRequest('http://localhost/api/modify', {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify({
                    prompt: 'Add a new file',
                    projectState: serializedProjectState,
                }),
            });

            const response = await modifyPOST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.changeSummary).toBe('Modified files');
        });
    });
});
