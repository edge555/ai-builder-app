import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { RuntimeError } from '@/shared';
import type { RepairPhase } from '@/components/RepairStatus';
import type { AggregatedErrors } from '@/services/ErrorAggregator';
import { errorAggregator } from '@/services/ErrorAggregator';

import { PreviewErrorContext, type PreviewErrorContextValue } from './PreviewErrorContext.context';

const MAX_REPAIR_ATTEMPTS = 3;
const AUTO_REPAIR_DEBOUNCE_MS = 800;
const MAX_ERROR_QUEUE_SIZE = 50;

/**
 * Provider for preview error state management.
 * Tracks runtime errors and manages auto-repair flow.
 */
export function PreviewErrorProvider({ children }: { children: React.ReactNode }) {
  const [currentError, setCurrentError] = useState<RuntimeError | null>(null);
  const [errorQueue, setErrorQueue] = useState<RuntimeError[]>([]);
  const [aggregatedErrors, setAggregatedErrors] = useState<AggregatedErrors | null>(null);
  const [repairPhase, setRepairPhase] = useState<RepairPhase>('idle');
  const [isAutoRepairing, setIsAutoRepairing] = useState(false);
  const [repairAttempts, setRepairAttempts] = useState(0);
  
  const lastErrorRef = useRef<string | null>(null);
  const autoRepairTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoRepairTimeoutRef.current) {
        clearTimeout(autoRepairTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Report a single error.
   */
  const reportError = useCallback((error: RuntimeError) => {
    // Avoid reporting the same error repeatedly
    const errorKey = `${error.message}:${error.filePath}:${error.line}`;
    if (lastErrorRef.current === errorKey) {
      return;
    }
    lastErrorRef.current = errorKey;
    
    setCurrentError(error);
    setErrorQueue(prev => {
      const newQueue = [...prev, error];
      // Cap queue size to prevent memory issues
      if (newQueue.length > MAX_ERROR_QUEUE_SIZE) {
        return newQueue.slice(-MAX_ERROR_QUEUE_SIZE);
      }
      return newQueue;
    });
    
    // Add to aggregator for deduplication and prioritization
    errorAggregator.addError(error);
    
    // Set detecting phase
    if (repairPhase === 'idle') {
      setRepairPhase('detecting');
    }
    
    console.error('[PreviewError] Runtime error captured:', {
      type: error.type,
      priority: error.priority,
      message: error.message.slice(0, 100),
      file: error.filePath,
    });
  }, [repairPhase]);

  /**
   * Report aggregated errors ready for repair.
   */
  const reportAggregatedErrors = useCallback((errors: AggregatedErrors) => {
    setAggregatedErrors(errors);
    
    if (errors.totalCount > 0) {
      setRepairPhase('detecting');
      
      // Schedule auto-repair transition
      if (autoRepairTimeoutRef.current) {
        clearTimeout(autoRepairTimeoutRef.current);
      }
      
      // Use shorter delay for critical errors
      const delay = errors.hasCriticalErrors ? 0 : AUTO_REPAIR_DEBOUNCE_MS;
      
      autoRepairTimeoutRef.current = setTimeout(() => {
        if (repairAttempts < MAX_REPAIR_ATTEMPTS && !isAutoRepairing) {
          setRepairPhase('repairing');
        }
      }, delay);
    }
  }, [repairAttempts, isAutoRepairing]);

  /**
   * Clear the current error.
   */
  const clearError = useCallback(() => {
    setCurrentError(null);
    lastErrorRef.current = null;
  }, []);

  /**
   * Clear all errors.
   */
  const clearAllErrors = useCallback(() => {
    setCurrentError(null);
    setErrorQueue([]);
    setAggregatedErrors(null);
    lastErrorRef.current = null;
    errorAggregator.clear();
    
    if (autoRepairTimeoutRef.current) {
      clearTimeout(autoRepairTimeoutRef.current);
      autoRepairTimeoutRef.current = null;
    }
  }, []);

  /**
   * Mark auto-repair as started.
   */
  const startAutoRepair = useCallback(() => {
    setIsAutoRepairing(true);
    setRepairAttempts(prev => prev + 1);
    setRepairPhase('repairing');
  }, []);

  /**
   * Mark auto-repair as completed.
   */
  const completeAutoRepair = useCallback((success: boolean) => {
    setIsAutoRepairing(false);
    
    if (success) {
      setCurrentError(null);
      setErrorQueue([]);
      setAggregatedErrors(null);
      lastErrorRef.current = null;
      errorAggregator.clear();
      setRepairPhase('success');
      
      // Auto-dismiss after success
      setTimeout(() => {
        setRepairPhase('idle');
      }, 3000);
    } else {
      // Check if we should retry or give up
      if (repairAttempts >= MAX_REPAIR_ATTEMPTS) {
        setRepairPhase('failed');
      } else {
        // Will retry on next error detection
        setRepairPhase('detecting');
      }
    }
  }, [repairAttempts]);

  /**
   * Reset repair attempts counter.
   */
  const resetRepairAttempts = useCallback(() => {
    setRepairAttempts(0);
    lastErrorRef.current = null;
    setRepairPhase('idle');
    
    if (autoRepairTimeoutRef.current) {
      clearTimeout(autoRepairTimeoutRef.current);
      autoRepairTimeoutRef.current = null;
    }
  }, []);

  /**
   * Check if we should attempt auto-repair.
   */
  const shouldAutoRepair = useCallback(() => {
    return (
      (currentError !== null || (aggregatedErrors?.totalCount ?? 0) > 0) &&
      !isAutoRepairing &&
      repairAttempts < MAX_REPAIR_ATTEMPTS
    );
  }, [currentError, aggregatedErrors, isAutoRepairing, repairAttempts]);

  /**
   * Dismiss the repair status UI.
   */
  const dismissRepairStatus = useCallback(() => {
    setRepairPhase('idle');
  }, []);

  const value = useMemo<PreviewErrorContextValue>(() => ({
    currentError,
    errorQueue,
    aggregatedErrors,
    repairPhase,
    isAutoRepairing,
    repairAttempts,
    maxRepairAttempts: MAX_REPAIR_ATTEMPTS,
    reportError,
    reportAggregatedErrors,
    clearError,
    clearAllErrors,
    startAutoRepair,
    completeAutoRepair,
    resetRepairAttempts,
    shouldAutoRepair,
    setRepairPhase,
    dismissRepairStatus,
  }), [
    currentError,
    errorQueue,
    aggregatedErrors,
    repairPhase,
    isAutoRepairing,
    repairAttempts,
    reportError,
    reportAggregatedErrors,
    clearError,
    clearAllErrors,
    startAutoRepair,
    completeAutoRepair,
    resetRepairAttempts,
    shouldAutoRepair,
    dismissRepairStatus,
  ]);

  return (
    <PreviewErrorContext.Provider value={value}>
      {children}
    </PreviewErrorContext.Provider>
  );
}
