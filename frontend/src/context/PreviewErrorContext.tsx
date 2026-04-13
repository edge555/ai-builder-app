import type { RuntimeError } from '@ai-app-builder/shared/types';
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';

import type { RepairPhase } from '@/components/RepairStatus';
import type { AggregatedErrors } from '@/services/ErrorAggregator';
import { createLogger } from '@/utils/logger';

import { useErrorAggregator } from './ErrorAggregatorContext';
import {
  PreviewErrorContext,
  PreviewErrorStateContext,
  PreviewErrorActionsContext,
  type PreviewErrorContextValue,
  type PreviewErrorState,
  type PreviewErrorActions
} from './PreviewErrorContext.context';

const previewErrorLogger = createLogger('PreviewError');

const MAX_REPAIR_ATTEMPTS = 5;
const AUTO_REPAIR_DEBOUNCE_MS = 800;
const MAX_ERROR_QUEUE_SIZE = 50;

/**
 * Provider for preview error state management.
 * Tracks runtime errors and manages auto-repair flow.
 */
export function PreviewErrorProvider({ children }: { children: React.ReactNode }) {
  const errorAggregator = useErrorAggregator();
  const [currentError, setCurrentError] = useState<RuntimeError | null>(null);
  const [errorQueue, setErrorQueue] = useState<RuntimeError[]>([]);
  const [aggregatedErrors, setAggregatedErrors] = useState<AggregatedErrors | null>(null);
  const [repairPhase, setRepairPhase] = useState<RepairPhase>('idle');
  const [isAutoRepairing, setIsAutoRepairing] = useState(false);
  const [repairAttempts, setRepairAttempts] = useState(0);
  const [repairExplanation, setRepairExplanation] = useState<string | null>(null);

  const lastErrorRef = useRef<string | null>(null);
  const autoRepairTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use refs to avoid stale closures in stable callbacks
  const repairPhaseRef = useRef<RepairPhase>(repairPhase);
  const repairAttemptsRef = useRef(repairAttempts);
  const isAutoRepairingRef = useRef(isAutoRepairing);

  // Sync refs with state values
  useEffect(() => { repairPhaseRef.current = repairPhase; }, [repairPhase]);
  useEffect(() => { repairAttemptsRef.current = repairAttempts; }, [repairAttempts]);
  useEffect(() => { isAutoRepairingRef.current = isAutoRepairing; }, [isAutoRepairing]);

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
    if (repairPhaseRef.current === 'idle') {
      setRepairPhase('detecting');
    }

    previewErrorLogger.error('Runtime error captured', {
      type: error.type,
      priority: error.priority,
      message: error.message,
      file: error.filePath,
    });
  }, []);

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
        if (repairAttemptsRef.current < MAX_REPAIR_ATTEMPTS && !isAutoRepairingRef.current) {
          setRepairPhase('repairing');
        }
      }, delay);
    }
  }, []);

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
    setRepairExplanation(null);
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
    setRepairExplanation(null);
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
      if (repairAttemptsRef.current >= MAX_REPAIR_ATTEMPTS) {
        setRepairPhase('failed');
      } else {
        // Will retry on next error detection
        setRepairPhase('detecting');
      }
      setRepairExplanation(null);
    }
  }, []);

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
    setRepairExplanation(null);
  }, []);

  /**
   * Check if we should attempt auto-repair.
   */
  const shouldAutoRepair = useCallback(() => {
    return (
      (currentError !== null || (aggregatedErrors?.totalCount ?? 0) > 0) &&
      !isAutoRepairingRef.current &&
      repairAttemptsRef.current < MAX_REPAIR_ATTEMPTS
    );
  }, [currentError, aggregatedErrors]);

  /**
   * Dismiss the repair status UI.
   */
  const dismissRepairStatus = useCallback(() => {
    setRepairPhase('idle');
  }, []);

  // Separate state and actions for optimized re-renders
  const stateValue = useMemo<PreviewErrorState>(() => ({
    currentError,
    errorQueue,
    aggregatedErrors,
    repairPhase,
    isAutoRepairing,
    repairAttempts,
    maxRepairAttempts: MAX_REPAIR_ATTEMPTS,
    repairExplanation,
  }), [
    currentError,
    errorQueue,
    aggregatedErrors,
    repairPhase,
    isAutoRepairing,
    repairAttempts,
    repairExplanation,
  ]);

  const actionsValue = useMemo<PreviewErrorActions>(() => ({
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
    setRepairExplanation,
  }), [
    reportError,
    reportAggregatedErrors,
    clearError,
    clearAllErrors,
    startAutoRepair,
    completeAutoRepair,
    resetRepairAttempts,
    shouldAutoRepair,
    dismissRepairStatus,
    setRepairExplanation,
  ]);

  // Combined value for backward compatibility
  const value = useMemo<PreviewErrorContextValue>(() => ({
    ...stateValue,
    ...actionsValue,
  }), [stateValue, actionsValue]);

  return (
    <PreviewErrorStateContext.Provider value={stateValue}>
      <PreviewErrorActionsContext.Provider value={actionsValue}>
        <PreviewErrorContext.Provider value={value}>
          {children}
        </PreviewErrorContext.Provider>
      </PreviewErrorActionsContext.Provider>
    </PreviewErrorStateContext.Provider>
  );
}
