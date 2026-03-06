import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Info, AlertTriangle, AlertCircle, X } from 'lucide-react';
import { useToastState, useToastActions, type ToastItem, type ToastType } from '@/context/ToastContext';
import './ToastContainer.css';

const ICONS: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
};

function CountdownBar({ endsAt }: { endsAt: number }) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const total = endsAt - Date.now();
    if (total <= 0) return;

    const interval = setInterval(() => {
      const remaining = endsAt - Date.now();
      if (remaining <= 0) {
        setProgress(0);
        clearInterval(interval);
      } else {
        setProgress((remaining / total) * 100);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [endsAt]);

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
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [endsAt]);

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
