import { useCallback, useEffect, useRef } from 'react';

export interface ResizablePanelProps {
  /** Current width of the panel */
  width: number;
  /** Callback when width changes */
  onWidthChange: (width: number) => void;
  /** Minimum width constraint */
  minWidth: number;
  /** Maximum width constraint (as fraction of viewport or absolute px) */
  maxWidth: number;
  /** Children to render */
  children: React.ReactNode;
  /** Optional className for the panel */
  className?: string;
  /** Optional style for the panel */
  style?: React.CSSProperties;
}

/**
 * A reusable resizable panel component with drag-to-resize functionality.
 * Includes keyboard navigation support for accessibility.
 *
 * Features:
 * - Mouse drag resizing
 * - Keyboard arrow key resizing
 * - RAF-throttled updates for smooth performance
 * - ARIA attributes for accessibility
 */
export function ResizablePanel({
  width,
  onWidthChange,
  minWidth,
  maxWidth,
  children,
  className = '',
  style = {},
}: ResizablePanelProps) {
  const isResizing = useRef(false);
  const rafId = useRef<number | null>(null);
  const maxWidthRef = useRef(maxWidth); // Ref for resize callback (no re-render)

  // Update maxWidth ref when prop changes
  useEffect(() => {
    maxWidthRef.current = maxWidth;
  }, [maxWidth]);

  const startResizing = useCallback(() => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';

    // Cancel any pending RAF
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (!isResizing.current) return;

    // Cancel previous RAF if it exists
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
    }

    // Throttle updates to 60fps using requestAnimationFrame
    rafId.current = requestAnimationFrame(() => {
      const currentMaxWidth = maxWidthRef.current;
      const newWidth = Math.max(
        minWidth,
        Math.min(e.clientX, currentMaxWidth)
      );
      onWidthChange(newWidth);
      rafId.current = null;
    });
  }, [minWidth, onWidthChange]);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  return (
    <>
      <div className={className} style={style}>
        {children}
      </div>

      <div
        className="resizer"
        onMouseDown={startResizing}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        tabIndex={0}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={width}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 72 : 24;

          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            onWidthChange(Math.max(minWidth, width - step));
            return;
          }

          if (e.key === 'ArrowRight') {
            e.preventDefault();
            onWidthChange(Math.min(maxWidth, width + step));
            return;
          }

          if (e.key === 'Home') {
            e.preventDefault();
            onWidthChange(minWidth);
            return;
          }

          if (e.key === 'End') {
            e.preventDefault();
            onWidthChange(maxWidth);
            return;
          }
        }}
      />
    </>
  );
}
