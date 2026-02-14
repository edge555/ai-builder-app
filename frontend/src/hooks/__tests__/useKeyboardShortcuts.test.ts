import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
    const mockHandlers = {
        onUndo: vi.fn(),
        onRedo: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Mock navigator.platform
        Object.defineProperty(navigator, 'platform', {
            value: 'Win32',
            configurable: true,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should trigger onUndo when Ctrl+Z is pressed', () => {
        renderHook(() => useKeyboardShortcuts(mockHandlers));

        const event = new KeyboardEvent('keydown', {
            key: 'z',
            ctrlKey: true,
            bubbles: true,
        });

        window.dispatchEvent(event);

        expect(mockHandlers.onUndo).toHaveBeenCalledTimes(1);
        expect(mockHandlers.onRedo).not.toHaveBeenCalled();
    });

    it('should trigger onRedo when Ctrl+Shift+Z is pressed', () => {
        renderHook(() => useKeyboardShortcuts(mockHandlers));

        const event = new KeyboardEvent('keydown', {
            key: 'z',
            ctrlKey: true,
            shiftKey: true,
            bubbles: true,
        });

        window.dispatchEvent(event);

        expect(mockHandlers.onRedo).toHaveBeenCalledTimes(1);
        expect(mockHandlers.onUndo).not.toHaveBeenCalled();
    });

    it('should trigger onRedo when Ctrl+Y is pressed', () => {
        renderHook(() => useKeyboardShortcuts(mockHandlers));

        const event = new KeyboardEvent('keydown', {
            key: 'y',
            ctrlKey: true,
            bubbles: true,
        });

        window.dispatchEvent(event);

        expect(mockHandlers.onRedo).toHaveBeenCalledTimes(1);
    });

    it('should use Cmd key on Mac instead of Ctrl', () => {
        Object.defineProperty(navigator, 'platform', {
            value: 'MacIntel',
            configurable: true,
        });

        renderHook(() => useKeyboardShortcuts(mockHandlers));

        const event = new KeyboardEvent('keydown', {
            key: 'z',
            metaKey: true,
            bubbles: true,
        });

        window.dispatchEvent(event);

        expect(mockHandlers.onUndo).toHaveBeenCalledTimes(1);
    });

    it('should not trigger shortcuts when typing in input field', () => {
        renderHook(() => useKeyboardShortcuts(mockHandlers));

        const input = document.createElement('input');
        document.body.appendChild(input);

        const event = new KeyboardEvent('keydown', {
            key: 'z',
            ctrlKey: true,
            bubbles: true,
        });

        Object.defineProperty(event, 'target', { value: input, configurable: true });
        window.dispatchEvent(event);

        expect(mockHandlers.onUndo).not.toHaveBeenCalled();

        document.body.removeChild(input);
    });

    it('should not trigger shortcuts when typing in textarea', () => {
        renderHook(() => useKeyboardShortcuts(mockHandlers));

        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);

        const event = new KeyboardEvent('keydown', {
            key: 'z',
            ctrlKey: true,
            bubbles: true,
        });

        Object.defineProperty(event, 'target', { value: textarea, configurable: true });
        window.dispatchEvent(event);

        expect(mockHandlers.onUndo).not.toHaveBeenCalled();

        document.body.removeChild(textarea);
    });

    it('should not trigger shortcuts when in contentEditable element', () => {
        renderHook(() => useKeyboardShortcuts(mockHandlers));

        const div = document.createElement('div');
        div.contentEditable = 'true';
        document.body.appendChild(div);

        const event = new KeyboardEvent('keydown', {
            key: 'z',
            ctrlKey: true,
            bubbles: true,
        });

        Object.defineProperty(event, 'target', { value: div, configurable: true });
        window.dispatchEvent(event);

        expect(mockHandlers.onUndo).not.toHaveBeenCalled();

        document.body.removeChild(div);
    });

    it('should not trigger shortcuts when in Monaco editor', () => {
        renderHook(() => useKeyboardShortcuts(mockHandlers));

        const monacoDiv = document.createElement('div');
        monacoDiv.className = 'monaco-editor';
        const innerDiv = document.createElement('div');
        monacoDiv.appendChild(innerDiv);
        document.body.appendChild(monacoDiv);

        const event = new KeyboardEvent('keydown', {
            key: 'z',
            ctrlKey: true,
            bubbles: true,
        });

        Object.defineProperty(event, 'target', { value: innerDiv, configurable: true });
        window.dispatchEvent(event);

        expect(mockHandlers.onUndo).not.toHaveBeenCalled();

        document.body.removeChild(monacoDiv);
    });

    it('should prevent default browser behavior for shortcuts', () => {
        renderHook(() => useKeyboardShortcuts(mockHandlers));

        const event = new KeyboardEvent('keydown', {
            key: 'z',
            ctrlKey: true,
            bubbles: true,
        });

        const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
        window.dispatchEvent(event);

        expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should cleanup event listeners on unmount', () => {
        const { unmount } = renderHook(() => useKeyboardShortcuts(mockHandlers));

        unmount();

        const event = new KeyboardEvent('keydown', {
            key: 'z',
            ctrlKey: true,
            bubbles: true,
        });

        window.dispatchEvent(event);

        expect(mockHandlers.onUndo).not.toHaveBeenCalled();
    });

    it('should handle missing handlers gracefully', () => {
        renderHook(() => useKeyboardShortcuts({}));

        const event = new KeyboardEvent('keydown', {
            key: 'z',
            ctrlKey: true,
            bubbles: true,
        });

        // Should not throw
        expect(() => window.dispatchEvent(event)).not.toThrow();
    });

    it('should not trigger undo when Shift is pressed with Ctrl+Z', () => {
        renderHook(() => useKeyboardShortcuts(mockHandlers));

        const event = new KeyboardEvent('keydown', {
            key: 'z',
            ctrlKey: true,
            shiftKey: true,
            bubbles: true,
        });

        window.dispatchEvent(event);

        expect(mockHandlers.onUndo).not.toHaveBeenCalled();
        expect(mockHandlers.onRedo).toHaveBeenCalledTimes(1);
    });
});
