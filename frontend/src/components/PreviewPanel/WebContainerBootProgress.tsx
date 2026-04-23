import { useState } from 'react';
import type { WebContainerPhase } from '@/hooks/useWebContainer';

interface WebContainerBootProgressProps {
  phase: WebContainerPhase;
  installOutput: string;
}

function phaseMessage(phase: WebContainerPhase): string {
  switch (phase) {
    case 'booting':   return 'Starting runtime\u2026';
    case 'mounting':  return 'Loading project files\u2026';
    case 'installing': return 'Installing dependencies\u2026';
    case 'starting':  return 'Starting dev server\u2026';
    case 'error':     return 'Failed to start preview';
    default:          return 'Preparing preview\u2026';
  }
}

/**
 * Estimate rough install progress (0–100) from npm output line count.
 * npm typically emits ~1 line per package + a few header/footer lines.
 */
function estimateProgress(output: string): number {
  const lines = output.split('\n').filter(l => l.trim()).length;
  // Clamp between 5 and 95 — never show 0% or 100% during install
  return Math.min(95, Math.max(5, Math.round((lines / 80) * 90)));
}

/**
 * Overlay shown while WebContainer is initialising.
 * Shows a human-readable progress message and hides raw npm output behind
 * a collapsible "Details" toggle so non-technical users see a clean progress UI.
 */
export function WebContainerBootProgress({ phase, installOutput }: WebContainerBootProgressProps) {
  const [showDetails, setShowDetails] = useState(false);

  const progress = phase === 'installing' ? estimateProgress(installOutput) : null;

  const lastLines = installOutput
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .slice(-5);

  return (
    <div className="wc-boot-progress">
      <div className="wc-boot-progress__inner">
        <div className="wc-boot-progress__spinner" aria-hidden="true" />
        <p className="wc-boot-progress__message">{phaseMessage(phase)}</p>

        {phase === 'installing' && progress !== null && (
          <div className="wc-boot-progress__bar-wrap" aria-label={`Installing dependencies, ${progress}%`}>
            <div className="wc-boot-progress__bar" style={{ width: `${progress}%` }} />
          </div>
        )}

        {phase === 'installing' && installOutput && (
          <button
            className="wc-boot-progress__details-toggle"
            onClick={() => setShowDetails(v => !v)}
            aria-expanded={showDetails}
          >
            {showDetails ? 'Hide details' : 'Show details'}
          </button>
        )}

        {showDetails && lastLines.length > 0 && (
          <div className="wc-boot-progress__output" aria-live="polite">
            {lastLines.map((line, i) => (
              <span key={i} className="wc-boot-progress__output-line">{line}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
