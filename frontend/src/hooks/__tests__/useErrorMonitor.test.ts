import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useErrorAggregator } from '@/context/ErrorAggregatorContext';

import { useErrorMonitor } from '../useErrorMonitor';


// Mock the error aggregator context
vi.mock('@/context/ErrorAggregatorContext', () => ({
    useErrorAggregator: vi.fn(),
}));

// Mock shared utilities
vi.mock('@ai-app-builder/shared', () => ({
    createRuntimeError: vi.fn((error, source, componentStack) => ({
        message: error.message,
        type: 'RUNTIME_ERROR',
        priority: 'critical',
        source,
        timestamp: new Date().toISOString(),
        stack: error.stack,
        componentStack,
    })),
    shouldIgnoreError: vi.fn((message) => message.includes('ignore')),
    parseBundlerError: vi.fn((message) => ({
        message,
        type: 'BUILD_ERROR',
        priority: 'critical',
        filePath: 'test.js',
        line: 10,
        column: 5,
    })),
}));

describe('useErrorMonitor', () => {
    let mockAggregator: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockAggregator = {
            addError: vi.fn(),
            clear: vi.fn(),
            getCount: vi.fn(() => 0),
            flush: vi.fn(() => ({ errors: [], count: 0 })),
            hasErrors: vi.fn(() => false),
            setFlushCallback: vi.fn(),
        };

        vi.mocked(useErrorAggregator).mockReturnValue(mockAggregator);
    });

    it('should capture console errors', () => {
        const { result } = renderHook(() => useErrorMonitor());

        act(() => {
            result.current.captureConsoleError('Test error message');
        });

        expect(mockAggregator.addError).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Test error message',
                source: 'console',
            })
        );
    });

    it('should capture console errors with stack trace', () => {
        const { result } = renderHook(() => useErrorMonitor());

        act(() => {
            result.current.captureConsoleError('Test error', 'Error stack trace');
        });

        expect(mockAggregator.addError).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Test error',
                stack: 'Error stack trace',
            })
        );
    });

    it('should ignore errors that should be ignored', () => {
        const { result } = renderHook(() => useErrorMonitor());

        act(() => {
            result.current.captureConsoleError('Please ignore this error');
        });

        expect(mockAggregator.addError).not.toHaveBeenCalled();
    });

    it('should capture bundler errors', () => {
        const { result } = renderHook(() => useErrorMonitor());

        act(() => {
            result.current.captureBundlerError('Syntax error in test.js');
        });

        expect(mockAggregator.addError).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Syntax error in test.js',
                source: 'bundler',
                type: 'BUILD_ERROR',
                priority: 'critical',
            })
        );
    });

    it('should capture runtime errors from error boundary', () => {
        const { result } = renderHook(() => useErrorMonitor());

        const testError = new Error('Component crashed');
        const componentStack = 'at Component\n  at App';

        act(() => {
            result.current.captureRuntimeError(testError, componentStack);
        });

        expect(mockAggregator.addError).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Component crashed',
                source: 'error_boundary',
                componentStack,
            })
        );
    });

    it('should clear all errors', () => {
        const { result } = renderHook(() => useErrorMonitor());

        act(() => {
            result.current.clearErrors();
        });

        expect(mockAggregator.clear).toHaveBeenCalled();
    });

    it('should get error count', () => {
        mockAggregator.getCount.mockReturnValue(5);

        const { result } = renderHook(() => useErrorMonitor());

        const count = result.current.getErrorCount();
        expect(count).toBe(5);
    });

    it('should flush pending errors', () => {
        const mockErrors = { errors: [{ message: 'Test' }], count: 1 };
        mockAggregator.flush.mockReturnValue(mockErrors);

        const { result } = renderHook(() => useErrorMonitor());

        const flushed = result.current.flush();
        expect(flushed).toEqual(mockErrors);
    });

    it('should check if there are pending errors', () => {
        mockAggregator.hasErrors.mockReturnValue(true);

        const { result } = renderHook(() => useErrorMonitor());

        const hasErrors = result.current.hasErrors();
        expect(hasErrors).toBe(true);
    });

    it('should set flush callback when onErrorsReady is provided', () => {
        const onErrorsReady = vi.fn();

        renderHook(() => useErrorMonitor({ onErrorsReady }));

        expect(mockAggregator.setFlushCallback).toHaveBeenCalledWith(onErrorsReady);
    });

    it('should not capture errors when disabled', () => {
        const { result } = renderHook(() => useErrorMonitor({ enabled: false }));

        act(() => {
            result.current.captureConsoleError('Test error');
            result.current.captureBundlerError('Build error');
            result.current.captureRuntimeError(new Error('Runtime error'));
        });

        expect(mockAggregator.addError).not.toHaveBeenCalled();
    });

    it('should cleanup on unmount', () => {
        const { unmount } = renderHook(() => useErrorMonitor());

        unmount();

        expect(mockAggregator.clear).toHaveBeenCalled();
    });

    it('should handle multiple console errors', () => {
        const { result } = renderHook(() => useErrorMonitor());

        act(() => {
            result.current.captureConsoleError('Error 1');
            result.current.captureConsoleError('Error 2');
            result.current.captureConsoleError('Error 3');
        });

        expect(mockAggregator.addError).toHaveBeenCalledTimes(3);
    });

    it('should handle bundler errors with file path information', () => {
        const { result } = renderHook(() => useErrorMonitor());

        act(() => {
            result.current.captureBundlerError('Module not found: ./missing.js');
        });

        expect(mockAggregator.addError).toHaveBeenCalledWith(
            expect.objectContaining({
                filePath: 'test.js',
                line: 10,
                column: 5,
            })
        );
    });
});
