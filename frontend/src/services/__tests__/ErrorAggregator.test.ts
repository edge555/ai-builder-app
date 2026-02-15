import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { ErrorAggregator } from '../ErrorAggregator';

import type { RuntimeError } from '@/shared/types/runtime-error';

describe('ErrorAggregator', () => {
    let aggregator: ErrorAggregator;

    beforeEach(() => {
        aggregator = new ErrorAggregator();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const mockError: RuntimeError = {
        message: 'Test error',
        type: 'BUILD_ERROR',
        priority: 'critical',
        source: 'bundler',
        timestamp: new Date().toISOString(),
        filePath: 'App.tsx',
    };

    it('should add an error and return true', () => {
        const result = aggregator.addError(mockError);
        expect(result).toBe(true);
        expect(aggregator.getCount()).toBe(1);
    });

    it('should not add duplicate errors', () => {
        aggregator.addError(mockError);
        const result = aggregator.addError(mockError);
        expect(result).toBe(false);
        expect(aggregator.getCount()).toBe(1);
    });

    it('should flush errors and trigger callback', () => {
        const callback = vi.fn();
        aggregator.setFlushCallback(callback);
        aggregator.addError(mockError);

        // Critical error flushes immediately in the implementation (delay 0)
        expect(callback).toHaveBeenCalled();
        const result = aggregator.getErrors();
        expect(result.length).toBe(1);
    });

    it('should debounce non-critical errors', () => {
        const callback = vi.fn();
        aggregator.setFlushCallback(callback);

        const mediumPriorityError: RuntimeError = {
            ...mockError,
            priority: 'medium',
        };

        aggregator.addError(mediumPriorityError);
        expect(callback).not.toHaveBeenCalled();

        vi.advanceTimersByTime(5000); // Wait for flush
        expect(callback).toHaveBeenCalled();
    });

    it('should clear errors', () => {
        aggregator.addError(mockError);
        expect(aggregator.getCount()).toBe(1);
        aggregator.clear();
        expect(aggregator.getCount()).toBe(0);
    });

    it('should build an error report', () => {
        aggregator.addError(mockError);
        const report = aggregator.buildErrorReport();
        expect(report).toContain('=== AUTO-REPAIR REQUEST ===');
        expect(report).toContain('Test error');
        expect(report).toContain('App.tsx');
    });
});
