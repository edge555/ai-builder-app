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
 * Overlay shown while WebContainer is initializing.
 * Displays phase-appropriate message and last lines of install output.
 */
export function WebContainerBootProgress({ phase, installOutput }: WebContainerBootProgressProps) {
  const lastLines = installOutput
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .slice(-3);

  return (
    <div className="wc-boot-progress">
      <div className="wc-boot-progress__inner">
        <div className="wc-boot-progress__spinner" aria-hidden="true" />
        <p className="wc-boot-progress__message">{phaseMessage(phase)}</p>
        {phase === 'installing' && lastLines.length > 0 && (
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
