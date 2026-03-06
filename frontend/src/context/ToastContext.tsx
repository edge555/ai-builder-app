import { createContext, useContext, useCallback, useState, useMemo, type ReactNode } from 'react';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  action?: ToastAction;
  autoDismissMs?: number;
  countdown?: { endsAt: number };
}

export interface ToastStateValue {
  toasts: ToastItem[];
}

export interface ToastActionsValue {
  addToast: (toast: Omit<ToastItem, 'id'>) => string;
  dismissToast: (id: string) => void;
  clearAll: () => void;
}

const MAX_TOASTS = 5;

const AUTO_DISMISS_DEFAULTS: Record<ToastType, number | null> = {
  success: 5000,
  info: 5000,
  warning: 8000,
  error: null,
};

const ToastStateContext = createContext<ToastStateValue | null>(null);
const ToastActionsContext = createContext<ToastActionsValue | null>(null);

export function useToastState(): ToastStateValue {
  const context = useContext(ToastStateContext);
  if (!context) {
    throw new Error('useToastState must be used within a ToastProvider');
  }
  return context;
}

export function useToastActions(): ToastActionsValue {
  const context = useContext(ToastActionsContext);
  if (!context) {
    throw new Error('useToastActions must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = crypto.randomUUID();
    const autoDismissMs = toast.autoDismissMs ?? AUTO_DISMISS_DEFAULTS[toast.type];

    setToasts(prev => {
      const next = [...prev, { ...toast, id, autoDismissMs: autoDismissMs ?? undefined }];
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    });

    if (autoDismissMs) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, autoDismissMs);
    }

    return id;
  }, []);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  const stateValue = useMemo<ToastStateValue>(() => ({ toasts }), [toasts]);
  const actionsValue = useMemo<ToastActionsValue>(() => ({ addToast, dismissToast, clearAll }), [addToast, dismissToast, clearAll]);

  return (
    <ToastStateContext.Provider value={stateValue}>
      <ToastActionsContext.Provider value={actionsValue}>
        {children}
      </ToastActionsContext.Provider>
    </ToastStateContext.Provider>
  );
}
