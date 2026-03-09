import { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import './TooltipGuide.css';

const TOOLTIPS_SEEN_KEY = 'builder-tooltips-seen';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipItem {
  targetSelector: string;
  message: string;
  placement: TooltipPlacement;
}

interface TooltipGuideProps {
  tooltips: TooltipItem[];
}

interface Position {
  top: number;
  left: number;
  placement: TooltipPlacement;
}

function computePosition(target: Element, placement: TooltipPlacement): Position {
  const rect = target.getBoundingClientRect();
  const gap = 10;

  switch (placement) {
    case 'bottom':
      return { top: rect.bottom + gap, left: rect.left + rect.width / 2, placement };
    case 'top':
      return { top: rect.top - gap, left: rect.left + rect.width / 2, placement };
    case 'left':
      return { top: rect.top + rect.height / 2, left: rect.left - gap, placement };
    case 'right':
      return { top: rect.top + rect.height / 2, left: rect.right + gap, placement };
  }
}

export function TooltipGuide({ tooltips }: TooltipGuideProps) {
  const [visible, setVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);
  const rafRef = useRef(0);

  const dismiss = useCallback(() => {
    localStorage.setItem(TOOLTIPS_SEEN_KEY, 'true');
    setVisible(false);
    cancelAnimationFrame(rafRef.current);
  }, []);

  // Position the current tooltip
  const updatePosition = useCallback(() => {
    if (!visible || currentIndex >= tooltips.length) return;

    const tip = tooltips[currentIndex];
    const target = document.querySelector(tip.targetSelector);
    if (target) {
      setPosition(computePosition(target, tip.placement));
    } else {
      setPosition(null);
    }

    rafRef.current = requestAnimationFrame(updatePosition);
  }, [visible, currentIndex, tooltips]);

  // Show tooltips after a delay (let the builder render first)
  useEffect(() => {
    if (localStorage.getItem(TOOLTIPS_SEEN_KEY) === 'true') return;

    const timer = setTimeout(() => {
      setVisible(true);
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  // Start position tracking
  useEffect(() => {
    if (visible) {
      rafRef.current = requestAnimationFrame(updatePosition);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [visible, updatePosition]);

  if (!visible || currentIndex >= tooltips.length) return null;

  const tip = tooltips[currentIndex];
  const isLast = currentIndex === tooltips.length - 1;

  const handleNext = () => {
    if (isLast) {
      dismiss();
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  };

  if (!position) return null;

  return (
    <div
      className={`tooltip-guide tooltip-guide--${position.placement}`}
      style={{ top: position.top, left: position.left }}
      role="tooltip"
    >
      <button
        className="tooltip-guide__close"
        onClick={dismiss}
        aria-label="Dismiss all tips"
        type="button"
      >
        <X size={12} />
      </button>
      <p className="tooltip-guide__message">{tip.message}</p>
      <div className="tooltip-guide__footer">
        <span className="tooltip-guide__counter">
          {currentIndex + 1}/{tooltips.length}
        </span>
        <button
          className="tooltip-guide__next"
          onClick={handleNext}
          type="button"
        >
          {isLast ? 'Got it' : 'Next'}
        </button>
      </div>
    </div>
  );
}

export function shouldShowTooltipGuide(): boolean {
  return localStorage.getItem(TOOLTIPS_SEEN_KEY) !== 'true';
}
