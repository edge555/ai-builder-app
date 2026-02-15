import { useState, useEffect, forwardRef } from 'react';
import './ChatInterface.css';

/**
 * Loading phase for progress indication.
 */
export type LoadingPhase = 'idle' | 'generating' | 'modifying' | 'validating' | 'processing';

/**
 * Detailed loading steps for different phases to simulate complex processing.
 */
const LOADING_STEPS: Record<LoadingPhase, string[]> = {
  idle: ['Ready'],
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

    // Reset index when phase changes
    useEffect(() => {
      setMessageIndex(0);
    }, [phase]);

    // Cycle through messages
    useEffect(() => {
      const steps = LOADING_STEPS[phase];
      if (!steps || steps.length <= 1) return;

      const interval = setInterval(() => {
        setMessageIndex((prev) => (prev + 1) % steps.length);
      }, 2000); // Change message every 2 seconds

      return () => clearInterval(interval);
    }, [phase]);

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
