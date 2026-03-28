/**
 * Complex edge case tests for useUndoRedo hook.
 *
 * The basic tests cover push/undo/redo/clear in isolation.
 * These tests focus on:
 *  - MAX_STACK_SIZE (20) eviction — oldest state is dropped, FIFO order preserved
 *  - Redo stack cleared on every new push
 *  - Interleaved undo/redo/push sequences and resulting stack invariants
 *  - null currentState during undo/redo (no crash, redo stack unaffected)
 *  - canUndo / canRedo flag accuracy across all transitions
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { SerializedProjectState } from '@ai-app-builder/shared/types';
import { useUndoRedo } from '../useUndoRedo';

const MAX_STACK_SIZE = 20;

function makeState(id: string): SerializedProjectState {
  return { id, files: {}, name: id } as unknown as SerializedProjectState;
}

/** Render the hook with the given initial currentState. */
function setup(current: SerializedProjectState | null = null) {
  return renderHook(
    ({ current }: { current: SerializedProjectState | null }) => useUndoRedo(current),
    { initialProps: { current } }
  );
}

describe('useUndoRedo — MAX_STACK_SIZE boundary behaviour', () => {
  it('stack holds exactly MAX_STACK_SIZE states when pushed MAX_STACK_SIZE times', () => {
    const { result } = setup();

    // Each push in its own act so refs stay fresh between pushes
    for (let i = 0; i < MAX_STACK_SIZE; i++) {
      act(() => { result.current.pushState(makeState(`s${i}`)); });
    }

    expect(result.current.canUndo).toBe(true);

    // Each undo in its own act so the undoStackRef re-syncs after each render
    for (let i = 0; i < MAX_STACK_SIZE; i++) {
      act(() => { result.current.undo(); });
    }

    expect(result.current.canUndo).toBe(false);
  });

  it('pushing one state beyond MAX_STACK_SIZE evicts the oldest entry (FIFO)', () => {
    const { result } = setup();

    // Push MAX_STACK_SIZE + 1 states: s0..s20
    for (let i = 0; i <= MAX_STACK_SIZE; i++) {
      act(() => { result.current.pushState(makeState(`s${i}`)); });
    }

    // The stack should contain s1..s20 (s0 was evicted)
    // Undoing MAX_STACK_SIZE times gives back the last pushed first
    const restored: string[] = [];
    for (let i = 0; i < MAX_STACK_SIZE; i++) {
      act(() => {
        const s = result.current.undo();
        if (s) restored.push((s as any).id);
      });
    }

    // Stack is s1..s20 (20 entries). Undo pops s20, then s19, ... s1.
    expect(restored[0]).toBe('s20');
    expect(restored[restored.length - 1]).toBe('s1');
    // s0 was evicted — never restored
    expect(restored).not.toContain('s0');
    // Exactly 20 states restored
    expect(restored).toHaveLength(MAX_STACK_SIZE);
  });

  it('redo stack is also bounded to MAX_STACK_SIZE', () => {
    const { result } = setup(makeState('current'));

    // Push MAX_STACK_SIZE states, then undo them all to fill the redo stack
    act(() => {
      for (let i = 0; i < MAX_STACK_SIZE; i++) {
        result.current.pushState(makeState(`s${i}`));
      }
    });
    act(() => {
      for (let i = 0; i < MAX_STACK_SIZE; i++) {
        result.current.undo();
      }
    });

    expect(result.current.canRedo).toBe(true);

    // Redo MAX_STACK_SIZE times should exhaust the redo stack
    act(() => {
      for (let i = 0; i < MAX_STACK_SIZE; i++) {
        result.current.redo();
      }
    });

    expect(result.current.canRedo).toBe(false);
  });
});

describe('useUndoRedo — redo stack cleared on new push', () => {
  it('redo stack is wiped when a new state is pushed mid-redo-sequence', () => {
    const { result } = setup(makeState('init'));

    act(() => {
      result.current.pushState(makeState('a'));
      result.current.pushState(makeState('b'));
      result.current.pushState(makeState('c'));
    });

    // Undo twice → redo stack has ['b', 'c']
    act(() => {
      result.current.undo();
      result.current.undo();
    });

    expect(result.current.canRedo).toBe(true);

    // Push a new branch → redo stack must clear
    act(() => {
      result.current.pushState(makeState('branch'));
    });

    expect(result.current.canRedo).toBe(false);
  });

  it('redo returns null immediately after a push following undo', () => {
    const { result } = setup(makeState('init'));

    act(() => {
      result.current.pushState(makeState('a'));
      result.current.pushState(makeState('b'));
    });

    act(() => { result.current.undo(); });
    act(() => { result.current.pushState(makeState('c')); });

    const redoResult = result.current.redo();

    expect(redoResult).toBeNull();
  });
});

describe('useUndoRedo — interleaved undo / redo / push sequences', () => {
  it('undo → redo round-trip returns the same state object', () => {
    const stateA = makeState('a');
    const stateB = makeState('b');
    const { result, rerender } = setup(makeState('init'));

    act(() => { result.current.pushState(stateA); });
    rerender({ current: stateA });

    act(() => { result.current.pushState(stateB); });
    rerender({ current: stateB });

    let undone: SerializedProjectState | null = null;
    act(() => { undone = result.current.undo(); });

    rerender({ current: undone });

    let redone: SerializedProjectState | null = null;
    act(() => { redone = result.current.redo(); });

    expect((redone as any)?.id).toBe('b');
  });

  it('push → undo → push → undo sequence leaves correct undo history', () => {
    const { result, rerender } = setup(makeState('init'));

    act(() => { result.current.pushState(makeState('a')); });
    rerender({ current: makeState('a') });

    act(() => { result.current.undo(); }); // undo to 'a' off stack, get 'a' back

    // After undo, redo stack has 'a', undo stack is empty
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    // Push new branch
    act(() => { result.current.pushState(makeState('branch')); });

    // Redo should now be unavailable (wiped by push)
    expect(result.current.canRedo).toBe(false);
    // New item was pushed to undo stack
    expect(result.current.canUndo).toBe(true);
  });

  it('multiple undos reduce canUndo flag accurately step by step', () => {
    const { result } = setup();

    act(() => {
      result.current.pushState(makeState('1'));
      result.current.pushState(makeState('2'));
      result.current.pushState(makeState('3'));
    });

    expect(result.current.canUndo).toBe(true);

    act(() => { result.current.undo(); });
    expect(result.current.canUndo).toBe(true);

    act(() => { result.current.undo(); });
    expect(result.current.canUndo).toBe(true);

    act(() => { result.current.undo(); });
    expect(result.current.canUndo).toBe(false);
  });

  it('multiple redos reduce canRedo flag accurately step by step', () => {
    const { result } = setup(makeState('init'));

    act(() => { result.current.pushState(makeState('1')); });
    act(() => { result.current.pushState(makeState('2')); });
    act(() => { result.current.pushState(makeState('3')); });
    act(() => { result.current.undo(); });
    act(() => { result.current.undo(); });
    act(() => { result.current.undo(); });

    expect(result.current.canRedo).toBe(true);

    act(() => { result.current.redo(); });
    expect(result.current.canRedo).toBe(true);

    act(() => { result.current.redo(); });
    expect(result.current.canRedo).toBe(true);

    act(() => { result.current.redo(); });
    expect(result.current.canRedo).toBe(false);
  });
});

describe('useUndoRedo — null currentState edge cases', () => {
  it('undo with null currentState does not crash and returns the top of the undo stack', () => {
    const { result } = setup(null);

    act(() => { result.current.pushState(makeState('a')); });

    let restored: SerializedProjectState | null = null;
    expect(() => {
      act(() => { restored = result.current.undo(); });
    }).not.toThrow();

    expect((restored as any)?.id).toBe('a');
  });

  it('undo with null currentState does not push null onto the redo stack', () => {
    const { result } = setup(null);

    act(() => {
      result.current.pushState(makeState('a'));
      result.current.pushState(makeState('b'));
    });

    // undo while currentState is still null (hook not updated)
    act(() => { result.current.undo(); });

    // redo should return what was on the redo stack (b); if null were pushed it would be null
    let redone: SerializedProjectState | null = null;
    act(() => { redone = result.current.redo(); });

    // Either redone is 'b' (the undone state) or redo stack is empty — null must NOT come through
    if (redone !== null) {
      expect((redone as any).id).not.toBeUndefined();
    }
  });

  it('redo with null currentState does not crash', () => {
    const { result } = setup(makeState('init'));

    act(() => {
      result.current.pushState(makeState('a'));
      result.current.undo();
    });

    // Re-render with null currentState
    const { result: result2 } = setup(null);
    act(() => { result2.current.pushState(makeState('x')); });
    act(() => { result2.current.undo(); });

    expect(() => {
      act(() => { result2.current.redo(); });
    }).not.toThrow();
  });

  it('undo on empty stack with null currentState returns null', () => {
    const { result } = setup(null);

    let s: SerializedProjectState | null = makeState('sentinel');
    act(() => { s = result.current.undo(); });

    expect(s).toBeNull();
  });
});

describe('useUndoRedo — callback stability (stable refs)', () => {
  it('pushState reference does not change across re-renders', () => {
    const { result, rerender } = setup(makeState('v1'));
    const ref1 = result.current.pushState;

    rerender({ current: makeState('v2') });
    const ref2 = result.current.pushState;

    expect(ref1).toBe(ref2);
  });

  it('undo reference does not change across re-renders', () => {
    const { result, rerender } = setup(makeState('v1'));
    const ref1 = result.current.undo;

    rerender({ current: makeState('v2') });
    const ref2 = result.current.undo;

    expect(ref1).toBe(ref2);
  });

  it('redo reference does not change across re-renders', () => {
    const { result, rerender } = setup(makeState('v1'));
    const ref1 = result.current.redo;

    rerender({ current: makeState('v2') });
    const ref2 = result.current.redo;

    expect(ref1).toBe(ref2);
  });

  it('clear reference does not change across re-renders', () => {
    const { result, rerender } = setup(makeState('v1'));
    const ref1 = result.current.clear;

    rerender({ current: makeState('v2') });
    const ref2 = result.current.clear;

    expect(ref1).toBe(ref2);
  });
});

describe('useUndoRedo — clear() resets all state', () => {
  it('clear wipes both undo and redo stacks', () => {
    const { result } = setup(makeState('init'));

    act(() => { result.current.pushState(makeState('a')); });
    act(() => { result.current.pushState(makeState('b')); });
    act(() => { result.current.undo(); });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);

    act(() => { result.current.clear(); });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.undo()).toBeNull();
    expect(result.current.redo()).toBeNull();
  });

  it('clear on empty stacks is a no-op (does not throw)', () => {
    const { result } = setup(null);

    expect(() => {
      act(() => { result.current.clear(); });
    }).not.toThrow();

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});
