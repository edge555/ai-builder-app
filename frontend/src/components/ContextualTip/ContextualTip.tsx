import { useState } from 'react';
import { X, Lightbulb } from 'lucide-react';
import './ContextualTip.css';

export interface ContextualTipProps {
  /** Unique key used to persist dismissal in localStorage */
  tipKey: string;
  message: string;
  icon?: React.ReactNode;
}

const STORAGE_PREFIX = 'dismissed_tip_';

export function ContextualTip({ tipKey, message, icon }: ContextualTipProps) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(STORAGE_PREFIX + tipKey) === 'true'
  );

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_PREFIX + tipKey, 'true');
    setDismissed(true);
  };

  return (
    <div className="contextual-tip" role="note">
      <span className="contextual-tip__icon" aria-hidden="true">
        {icon ?? <Lightbulb size={14} />}
      </span>
      <span className="contextual-tip__message">{message}</span>
      <button
        className="contextual-tip__dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss tip"
      >
        <X size={12} />
      </button>
    </div>
  );
}
