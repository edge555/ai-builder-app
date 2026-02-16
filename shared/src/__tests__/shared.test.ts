import { describe, expect, it } from 'vitest';
import { GenerateProjectRequestSchema, ModifyProjectRequestSchema, PlanProjectRequestSchema } from '../schemas/api';
import { computeFileDiff, generateChangeSummary } from '../utils/diff';

describe('Shared Package Tests', () => {
    describe('API Schemas', () => {
        it('should validate valid GenerateProjectRequest', () => {
            const data = { description: 'A test project' };
            const result = GenerateProjectRequestSchema.safeParse(data);
            expect(result.success).toBe(true);
        });

        it('should fail on invalid GenerateProjectRequest', () => {
            const data = { desc: 'Missing correct key' };
            const result = GenerateProjectRequestSchema.safeParse(data);
            expect(result.success).toBe(false);
        });

        it('should validate valid ModifyProjectRequest', () => {
            const data = {
                prompt: 'Add a file',
                projectState: {
                    id: '1',
                    name: 'test',
                    description: 'A test project',
                    files: {},
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    currentVersionId: 'v1',
                },
            };
            const result = ModifyProjectRequestSchema.safeParse(data);
            expect(result.success).toBe(true);
        });

        it('should validate valid PlanProjectRequest', () => {
            const data = {
                prompt: 'Add a new feature',
                fileTreeMetadata: [
                    {
                        path: 'src/App.tsx',
                        fileType: 'component',
                        lineCount: 50,
                        exports: ['App'],
                        imports: ['react'],
                    },
                ],
            };
            const result = PlanProjectRequestSchema.safeParse(data);
            expect(result.success).toBe(true);
        });

        it('should reject PlanProjectRequest with prompt longer than 50,000 characters', () => {
            const longPrompt = 'a'.repeat(50001);
            const data = {
                prompt: longPrompt,
                fileTreeMetadata: [
                    {
                        path: 'src/App.tsx',
                        fileType: 'component',
                        lineCount: 50,
                        exports: ['App'],
                        imports: ['react'],
                    },
                ],
            };
            const result = PlanProjectRequestSchema.safeParse(data);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toContain('too long');
            }
        });

        it('should reject PlanProjectRequest with more than 500 metadata entries', () => {
            const metadata = Array.from({ length: 501 }, (_, i) => ({
                path: `file${i}.ts`,
                fileType: 'component' as const,
                lineCount: 10,
                exports: [],
                imports: [],
            }));
            const data = {
                prompt: 'Valid prompt',
                fileTreeMetadata: metadata,
            };
            const result = PlanProjectRequestSchema.safeParse(data);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toContain('Too many files');
            }
        });

        it('should accept PlanProjectRequest with exactly 50,000 characters', () => {
            const maxPrompt = 'a'.repeat(50000);
            const data = {
                prompt: maxPrompt,
                fileTreeMetadata: [
                    {
                        path: 'src/App.tsx',
                        fileType: 'component',
                        lineCount: 50,
                        exports: ['App'],
                        imports: ['react'],
                    },
                ],
            };
            const result = PlanProjectRequestSchema.safeParse(data);
            expect(result.success).toBe(true);
        });

        it('should accept PlanProjectRequest with exactly 500 metadata entries', () => {
            const metadata = Array.from({ length: 500 }, (_, i) => ({
                path: `file${i}.ts`,
                fileType: 'component' as const,
                lineCount: 10,
                exports: [],
                imports: [],
            }));
            const data = {
                prompt: 'Valid prompt',
                fileTreeMetadata: metadata,
            };
            const result = PlanProjectRequestSchema.safeParse(data);
            expect(result.success).toBe(true);
        });
    });

    describe('Diff Utilities', () => {
        it('should compute correct diff for added lines', () => {
            const oldContent = 'line1\nline2';
            const newContent = 'line1\nline2\nline3';
            const hunks = computeFileDiff(oldContent, newContent);

            expect(hunks).toHaveLength(1);
            expect(hunks[0].newLines).toBe(3);
            expect(hunks[0].changes.some(c => c.type === 'add' && c.content === 'line3')).toBe(true);
        });

        it('should compute correct diff for deleted lines', () => {
            const oldContent = 'line1\nline2\nline3';
            const newContent = 'line1\nline3';
            const hunks = computeFileDiff(oldContent, newContent);

            expect(hunks).toHaveLength(1);
            expect(hunks[0].oldLines).toBe(3);
            expect(hunks[0].changes.some(c => c.type === 'delete' && c.content === 'line2')).toBe(true);
        });

        it('should generate a correct change summary', () => {
            const diffs = [
                {
                    filePath: 'test.txt',
                    status: 'modified' as const,
                    hunks: [
                        {
                            oldStart: 1, oldLines: 1, newStart: 1, newLines: 1,
                            changes: [{ type: 'add' as const, lineNumber: 1, content: 'new' }, { type: 'delete' as const, lineNumber: 1, content: 'old' }]
                        }
                    ]
                },
                {
                    filePath: 'new.txt',
                    status: 'added' as const,
                    hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, changes: [{ type: 'add' as const, lineNumber: 1, content: 'content' }] }]
                }
            ];

            const summary = generateChangeSummary(diffs as any);
            expect(summary.filesAdded).toBe(1);
            expect(summary.filesModified).toBe(1);
            expect(summary.linesAdded).toBe(2);
            expect(summary.linesDeleted).toBe(1);
        });
    });
});
