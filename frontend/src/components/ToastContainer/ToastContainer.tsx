import { useState, useCallback } from 'react';
import { CheckCircle, Info, AlertTriangle, AlertCircle, X } from 'lucide-react';
import { useToastState, useToastActions, type ToastItem, type ToastType } from '@/context/ToastContext';
import { useCountdown } from '@/hooks/useCountdown';
import './ToastContainer.css';

const ICONS: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
};

function CountdownBar({ endsAt }: { endsAt: number }) {
  const { progress } = useCountdown(endsAt);
  return (
    <div className="toast-countdown">
      <div
        className="toast-countdown-bar"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

function CountdownText({ endsAt }: { endsAt: number }) {
  const { seconds } = useCountdown(endsAt);
  if (seconds <= 0) return null;
  return <span className="toast-countdown-text">Try again in {seconds}s</span>;
}

function ToastItemView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [isExiting, setIsExiting] = useState(false);
  const Icon = ICONS[toast.type];

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  }, [onDismiss, toast.id]);

  return (
    <div
      className={`toast toast--${toast.type} ${isExiting ? 'toast--exiting' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="toast__content">
        <Icon className={`toast__icon toast__icon--${toast.type}`} size={18} />
        <div className="toast__body">
          <span className="toast__message">{toast.message}</span>
          {toast.countdown && <CountdownText endsAt={toast.countdown.endsAt} />}
        </div>
        {toast.action && (
          <button className="toast__action" onClick={toast.action.onClick}>
            {toast.action.label}
          </button>
        )}
        <button className="toast__dismiss" onClick={handleDismiss} aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
      {toast.countdown && <CountdownBar endsAt={toast.countdown.endsAt} />}
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useToastState();
  const { dismissToast } = useToastActions();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-label="Notifications">
      {toasts.map(toast => (
        <ToastItemView key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
