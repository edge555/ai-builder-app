import { useState, useEffect, useRef, forwardRef } from 'react';
import './ChatInterface.css';

const LOADING_TIPS = [
  'Ctrl+B toggles the sidebar',
  'You can scroll through previous messages while waiting',
  'Generation typically takes 10\u201330 seconds',
  'Ctrl+Z undoes the last change after generation',
  'Cancel and try a simpler prompt if this takes too long',
];

/**
 * Loading phase for progress indication.
 */
export type LoadingPhase = 'idle' | 'planning' | 'generating' | 'modifying' | 'validating' | 'processing';

/**
 * Detailed loading steps for different phases to simulate complex processing.
 */
const LOADING_STEPS: Record<LoadingPhase, string[]> = {
  idle: ['Ready'],
  planning: [
    'Understanding your request...',
    'Identifying affected files...',
    'Planning modifications...',
    'Prioritizing changes...',
  ],
  generating: [
    'Analyzing requirements...',
    'Designing application architecture...',
    'Scaffolding component tree...',
    'Generating data models...',
    'Constructing API routes...',
    'Writing business logic...',
    'Optimizing build configuration...',
    'Finalizing project structure...',
  ],
  modifying: [
    'Analyzing current project state...',
    'Reading source files...',
    'Calculating dependency graph...',
    'Designing requested changes...',
    'Applying code transformations...',
    'Updating type definitions...',
    'Verifying integrity...',
    'Rebuilding affected modules...',
  ],
  validating: [
    'Running static analysis...',
    'Checking type safety...',
    'Verifying imports...',
    'Ensuring compilation success...',
  ],
  processing: ['Processing...'],
};

/**
 * Props for the LoadingIndicator component.
 */
export interface LoadingIndicatorProps {
  /** Current loading phase */
  phase?: LoadingPhase;
}

/**
 * Loading indicator shown during API calls.
 * Shows cycling messages to simulate complex background processing.
 *
 * Requirements: 8.2
 */
export const LoadingIndicator = forwardRef<HTMLDivElement, LoadingIndicatorProps>(
  function LoadingIndicator({ phase = 'processing' }, ref) {
    const [messageIndex, setMessageIndex] = useState(0);
    const [tipIndex, setTipIndex] = useState(0);
    const [showTip, setShowTip] = useState(false);
    const [showSlowWarning, setShowSlowWarning] = useState(false);
    const tipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Reset index and tip visibility when phase changes
    useEffect(() => {
      setMessageIndex(0);
      setShowTip(false);
      setShowSlowWarning(false);

      // Show tip after 5 seconds of loading
      tipTimerRef.current = setTimeout(() => setShowTip(true), 5000);
      // Show slow warning after 30 seconds
      slowTimerRef.current = setTimeout(() => setShowSlowWarning(true), 30000);
      return () => {
        if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
        if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      };
    }, [phase]);

    // Cycle through messages
    useEffect(() => {
      const steps = LOADING_STEPS[phase];
      if (!steps || steps.length <= 1) return;

      const interval = setInterval(() => {
        setMessageIndex((prev) => (prev + 1) % steps.length);
      }, 2000);

      return () => clearInterval(interval);
    }, [phase]);

    // Cycle through tips every 4 seconds once visible
    useEffect(() => {
      if (!showTip) return;

      const interval = setInterval(() => {
        setTipIndex((prev) => (prev + 1) % LOADING_TIPS.length);
      }, 4000);

      return () => clearInterval(interval);
    }, [showTip]);

    const steps = LOADING_STEPS[phase] || ['Processing...'];
    const currentMessage = steps[messageIndex % steps.length];

    return (
      <div ref={ref} className="chat-loading" role="status" aria-label={currentMessage}>
        <div className="chat-loading-content">
          <div className="chat-loading-spinner">
            <div className="chat-loading-spinner-ring"></div>
          </div>
          <div className="chat-loading-info">
            <span className="chat-loading-text">{currentMessage}</span>
            {showSlowWarning ? (
              <span className="chat-loading-tip">Taking longer than expected — the AI service may be under heavy load</span>
            ) : showTip ? (
              <span className="chat-loading-tip">Tip: {LOADING_TIPS[tipIndex]}</span>
            ) : null}
          </div>
        </div>
        <div className="chat-loading-progress">
          <div
            className="chat-loading-progress-bar"
            style={{
              animationDuration: `${Math.max(2, steps.length * 2)}s`
            }}
          ></div>
        </div>
      </div>
    );
  }
);

LoadingIndicator.displayName = 'LoadingIndicator';
