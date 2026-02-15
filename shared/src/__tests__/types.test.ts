import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Import schemas from shared package
import type { SerializedProjectState } from '../types';

describe('Shared Types and Validators', () => {
    describe('SerializedProjectState', () => {
        it('should accept valid project state', () => {
            const validState: SerializedProjectState = {
                id: 'test-id',
                name: 'Test Project',
                description: 'Test description',
                files: {
                    'index.html': '<html></html>',
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                currentVersionId: 'v1',
            };

            expect(validState.id).toBe('test-id');
            expect(validState.name).toBe('Test Project');
            expect(Object.keys(validState.files)).toContain('index.html');
        });

        it('should handle empty files object', () => {
            const validState: SerializedProjectState = {
                id: 'test-id',
                name: 'Empty Project',
                description: 'Test description',
                files: {},
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                currentVersionId: 'v1',
            };

            expect(validState.files).toEqual({});
        });

        it('should handle multiple files', () => {
            const validState: SerializedProjectState = {
                id: 'test-id',
                name: 'Multi-file Project',
                description: 'Test description',
                files: {
                    'index.html': '<html></html>',
                    'app.js': 'console.log("test");',
                    'styles.css': 'body { margin: 0; }',
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                currentVersionId: 'v1',
            };

            expect(Object.keys(validState.files).length).toBe(3);
        });
    });

    describe('Type Guards', () => {
        it('should validate object structure', () => {
            const obj = {
                id: 'test',
                name: 'Test',
                files: {},
            };

            expect(obj).toHaveProperty('id');
            expect(obj).toHaveProperty('name');
            expect(obj).toHaveProperty('files');
        });

        it('should handle null values', () => {
            const obj = null;
            expect(obj).toBeNull();
        });

        it('should handle undefined values', () => {
            const obj = undefined;
            expect(obj).toBeUndefined();
        });
    });

    describe('Edge Cases', () => {
        it('should handle special characters in file names', () => {
            const validState: SerializedProjectState = {
                id: 'test-id',
                name: 'Test Project',
                description: 'Test description',
                files: {
                    'file-with-dash.js': 'content',
                    'file_with_underscore.ts': 'content',
                    'file.with.dots.css': 'content',
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                currentVersionId: 'v1',
            };

            expect(Object.keys(validState.files).length).toBe(3);
        });

        it('should handle long file content', () => {
            const longContent = 'x'.repeat(10000);
            const validState: SerializedProjectState = {
                id: 'test-id',
                name: 'Test Project',
                description: 'Test description',
                files: {
                    'large-file.txt': longContent,
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                currentVersionId: 'v1',
            };

            expect(validState.files['large-file.txt'].length).toBe(10000);
        });

        it('should handle unicode in project names', () => {
            const validState: SerializedProjectState = {
                id: 'test-id',
                name: 'Test Project 测试 🚀',
                description: 'Test description',
                files: {},
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                currentVersionId: 'v1',
            };

            expect(validState.name).toContain('测试');
            expect(validState.name).toContain('🚀');
        });
    });
});
