import { describe, expect, it } from 'vitest';

import { buildRepairPrompt, getRepairHints } from '../repair-prompt';

describe('repair-prompt', () => {
    describe('getRepairHints', () => {
        it('should return correct hints for BUILD_ERROR', () => {
            const hints = getRepairHints('BUILD_ERROR');
            expect(hints).toContain('- Check for syntax errors in the affected file');
        });

        it('should return correct hints for IMPORT_ERROR', () => {
            const hints = getRepairHints('IMPORT_ERROR');
            expect(hints).toContain('- Check if the module path is correct');
        });

        it('should return default hints for unknown error type', () => {
            const hints = getRepairHints('UNKNOWN_ERROR' as any);
            expect(hints).toContain('- Check for undefined values');
        });
    });

    describe('buildRepairPrompt', () => {
        it('should build a prompt for a single runtime error', () => {
            const error: any = {
                type: 'REFERENCE_ERROR' as const,
                message: 'x is not defined',
                filePath: 'App.tsx',
                line: 10,
                priority: 'high',
                timestamp: new Date().toISOString(),
                source: 'console',
            };

            const prompt = buildRepairPrompt(error);

            expect(prompt).toContain('Fix the following runtime error');
            expect(prompt).toContain('Error Type: REFERENCE_ERROR');
            expect(prompt).toContain('Error Message: x is not defined');
            expect(prompt).toContain('File: App.tsx');
            expect(prompt).toContain('Line: 10');
            expect(prompt).toContain('Common fixes for REFERENCE_ERROR:');
        });

        it('should include suggested fixes if provided', () => {
            const error: any = {
                type: 'TYPE_ERROR' as const,
                message: 'Cannot read property x of undefined',
                suggestedFixes: ['Add null check', 'Initialize variable'],
                priority: 'medium',
                timestamp: new Date().toISOString(),
                source: 'console',
            };

            const prompt = buildRepairPrompt(error);

            expect(prompt).toContain('Suggested fixes:');
            expect(prompt).toContain('- Add null check');
            expect(prompt).toContain('- Initialize variable');
        });

        it('should use errorAggregator if provided and has report', () => {
            const error: any = {
                type: 'TYPE_ERROR' as const,
                message: 'err',
                priority: 'low',
                timestamp: new Date().toISOString(),
                source: 'console',
            };
            const mockAggregator = {
                buildErrorReport: () => 'Aggregated Error Report',
            } as any;

            const prompt = buildRepairPrompt(error, {}, mockAggregator);

            expect(prompt).toBe('Aggregated Error Report');
        });
    });
});
