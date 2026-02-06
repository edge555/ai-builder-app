import type { LoadingPhase } from '../ChatInterface';
import './StatusIndicator.css';

interface StatusIndicatorProps {
  phase: LoadingPhase;
  isLoading: boolean;
}

const phaseLabels: Record<LoadingPhase, string> = {
  idle: 'Ready',
  generating: 'Generating',
  modifying: 'Modifying',
  validating: 'Validating',
  processing: 'Processing',
};

export function StatusIndicator({ phase, isLoading }: StatusIndicatorProps) {
  const label = phaseLabels[phase] || 'Ready';
  const isActive = isLoading && phase !== 'idle';

  return (
    <div className={`status-indicator ${isActive ? 'status-indicator--active' : ''}`}>
      <span className="status-indicator-dot" />
      <span className="status-indicator-label">{label}</span>
    </div>
  );
}

export default StatusIndicator;
