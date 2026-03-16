import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as generatePOST } from '../generate/route';
import { POST as modifyPOST } from '../modify/route';
import { createProjectGenerator } from '../../../lib/core';
import { createModificationEngine } from '../../../lib/diff';

// Mock the services
vi.mock('../../../lib/core', () => ({
    createProjectGenerator: vi.fn(),
}));

vi.mock('../../../lib/diff', () => ({
    createModificationEngine: vi.fn(),
}));

describe('API Integration Tests', () => {
    describe('POST /api/generate', () => {
        it('should return 201 on successful generation', async () => {
            const mockProjectState = { name: 'test-project', files: [] };
            const mockVersion = { id: 'v1', timestamp: Date.now() };

            vi.mocked(createProjectGenerator).mockReturnValue({
                generateProject: vi.fn().mockResolvedValue({
                    success: true,
                    projectState: mockProjectState,
                    version: mockVersion,
                }),
            });

            const request = new NextRequest('http://localhost/api/generate', {
                method: 'POST',
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
                body: JSON.stringify({}), // Missing description
            });

            const response = await generatePOST(request);
            expect(response.status).toBe(400);
        });
    });

    describe('POST /api/modify', () => {
        it('should return 200 on successful modification', async () => {
            const mockProjectState = { name: 'test-project', files: [] };
            const mockVersion = { id: 'v2', timestamp: Date.now() };

            vi.mocked(createModificationEngine).mockReturnValue({
                modifyProject: vi.fn().mockResolvedValue({
                    success: true,
                    projectState: mockProjectState,
                    version: mockVersion,
                    diffs: [],
                    changeSummary: 'Modified files',
                }),
            });

            const request = new NextRequest('http://localhost/api/modify', {
                method: 'POST',
                body: JSON.stringify({
                    prompt: 'Add a new file',
                    projectState: mockProjectState,
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
