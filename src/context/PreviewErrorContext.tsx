import React, { useContext, useState, useCallback, useMemo, useRef } from 'react';
import type { RuntimeError } from '@/shared';

import { PreviewErrorContext, type PreviewErrorContextValue } from './PreviewErrorContext.context';

const MAX_REPAIR_ATTEMPTS = 2;

/**
 * Provider for preview error state management.
 * Tracks runtime errors and auto-repair attempts.
 */
export function PreviewErrorProvider({ children }: { children: React.ReactNode }) {
  const [currentError, setCurrentError] = useState<RuntimeError | null>(null);
  const [isAutoRepairing, setIsAutoRepairing] = useState(false);
  const [repairAttempts, setRepairAttempts] = useState(0);
  const lastErrorRef = useRef<string | null>(null);

  const reportError = useCallback((error: RuntimeError) => {
    // Avoid reporting the same error repeatedly
    const errorKey = `${error.message}:${error.filePath}:${error.line}`;
    if (lastErrorRef.current === errorKey) {
      return;
    }
    lastErrorRef.current = errorKey;
    setCurrentError(error);
    console.error('[PreviewError] Runtime error captured:', error);
  }, []);

  const clearError = useCallback(() => {
    setCurrentError(null);
    lastErrorRef.current = null;
  }, []);

  const startAutoRepair = useCallback(() => {
    setIsAutoRepairing(true);
    setRepairAttempts(prev => prev + 1);
  }, []);

  const completeAutoRepair = useCallback((success: boolean) => {
    setIsAutoRepairing(false);
    if (success) {
      setCurrentError(null);
      lastErrorRef.current = null;
    }
  }, []);

  const resetRepairAttempts = useCallback(() => {
    setRepairAttempts(0);
    lastErrorRef.current = null;
  }, []);

  const shouldAutoRepair = useCallback(() => {
    return (
      currentError !== null &&
      !isAutoRepairing &&
      repairAttempts < MAX_REPAIR_ATTEMPTS
    );
  }, [currentError, isAutoRepairing, repairAttempts]);

  const value = useMemo<PreviewErrorContextValue>(() => ({
    currentError,
    isAutoRepairing,
    repairAttempts,
    maxRepairAttempts: MAX_REPAIR_ATTEMPTS,
    reportError,
    clearError,
    startAutoRepair,
    completeAutoRepair,
    resetRepairAttempts,
    shouldAutoRepair,
  }), [
    currentError,
    isAutoRepairing,
    repairAttempts,
    reportError,
    clearError,
    startAutoRepair,
    completeAutoRepair,
    resetRepairAttempts,
    shouldAutoRepair,
  ]);

  return (
    <PreviewErrorContext.Provider value={value}>
      {children}
    </PreviewErrorContext.Provider>
  );
}