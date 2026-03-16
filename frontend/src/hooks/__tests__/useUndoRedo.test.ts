import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { useUndoRedo } from '../useUndoRedo';

describe('useUndoRedo', () => {
    const mockState1 = { id: '1', name: 'state1', description: '', files: {}, createdAt: '', updatedAt: '', currentVersionId: '' };
    const mockState2 = { id: '2', name: 'state2', description: '', files: {}, createdAt: '', updatedAt: '', currentVersionId: '' };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should initialize with empty stacks', () => {
        const { result } = renderHook(() => useUndoRedo(null));
        expect(result.current.canUndo).toBe(false);
        expect(result.current.canRedo).toBe(false);
    });

    it('should push state to undo stack', () => {
        const { result } = renderHook(() => useUndoRedo(null));

        act(() => {
            result.current.pushState(mockState1);
        });

        expect(result.current.canUndo).toBe(true);
    });

    it('should undo and move current state to redo stack', () => {
        const { result } = renderHook(() => useUndoRedo(mockState2));

        act(() => {
            result.current.pushState(mockState1);
        });

        let undoneState;
        act(() => {
            undoneState = result.current.undo();
        });

        expect(undoneState).toEqual(mockState1);
        expect(result.current.canRedo).toBe(true);
    });

    it('should redo and move current state back to undo stack', () => {
        const { result } = renderHook(() => useUndoRedo(mockState1));

        act(() => {
            result.current.pushState(mockState1);
        });

        act(() => {
            result.current.undo();
        });

        expect(result.current.canRedo).toBe(true);

        let redoneState;
        act(() => {
            redoneState = result.current.redo();
        });

        expect(redoneState).toEqual(mockState1);
        expect(result.current.canUndo).toBe(true);
    });

    it('should clear all stacks', () => {
        const { result } = renderHook(() => useUndoRedo(null));

        act(() => {
            result.current.pushState(mockState1);
        });

        act(() => {
            result.current.clear();
        });

        expect(result.current.canUndo).toBe(false);
        expect(result.current.canRedo).toBe(false);
    });

    it('should have stable callback references across renders', () => {
        const { result, rerender } = renderHook(
            ({ state }) => useUndoRedo(state),
            { initialProps: { state: mockState1 } }
        );

        const firstPushState = result.current.pushState;
        const firstUndo = result.current.undo;
        const firstRedo = result.current.redo;
        const firstClear = result.current.clear;

        // Re-render with different state
        rerender({ state: mockState2 });

        expect(result.current.pushState).toBe(firstPushState);
        expect(result.current.undo).toBe(firstUndo);
        expect(result.current.redo).toBe(firstRedo);
        expect(result.current.clear).toBe(firstClear);
    });
});
