/**
 * Hook for preview error handlers with stable callbacks.
 * Uses refs internally to avoid re-renders when error state changes.
 */

import type { RuntimeError } from '@/shared';
import { useCallback, useRef, useEffect } from 'react';

import { usePreviewErrorState, usePreviewErrorActions } from '@/context';
import type { AggregatedErrors } from '@/services/ErrorAggregator';

/**
 * Provides stable error handler callbacks that don't cause re-renders.
 * Internally uses refs to track current state without subscribing to updates.
 */
export function usePreviewErrorHandlers() {
  const actions = usePreviewErrorActions();

  // Use refs to track current state without subscribing to re-renders
  const state = usePreviewErrorState();
  const stateRef = useRef(state);

  // Update ref when state changes (this component won't re-render from this)
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Stable callbacks that use refs
  const reportError = useCallback((error: RuntimeError) => {
    actions.reportError(error);
  }, [actions]);

  const reportAggregatedErrors = useCallback((errors: AggregatedErrors) => {
    actions.reportAggregatedErrors(errors);
  }, [actions]);

  const clearAllErrors = useCallback(() => {
    actions.clearAllErrors();
  }, [actions]);

  const setRepairPhase = useCallback((phase: Parameters<typeof actions.setRepairPhase>[0]) => {
    actions.setRepairPhase(phase);
  }, [actions]);

  const startAutoRepair = useCallback(() => {
    actions.startAutoRepair();
  }, [actions]);

  const completeAutoRepair = useCallback((success: boolean) => {
    actions.completeAutoRepair(success);
  }, [actions]);

  const shouldAutoRepair = useCallback(() => {
    return actions.shouldAutoRepair();
  }, [actions]);

  // Getter functions for state values (using refs)
  const getRepairPhase = useCallback(() => {
    return stateRef.current.repairPhase;
  }, []);

  const getAggregatedErrors = useCallback(() => {
    return stateRef.current.aggregatedErrors;
  }, []);

  const getIsAutoRepairing = useCallback(() => {
    return stateRef.current.isAutoRepairing;
  }, []);

  return {
    // Stable action callbacks
    reportError,
    reportAggregatedErrors,
    clearAllErrors,
    setRepairPhase,
    startAutoRepair,
    completeAutoRepair,
    shouldAutoRepair,

    // Getter functions for state (returns current value without subscribing)
    getRepairPhase,
    getAggregatedErrors,
    getIsAutoRepairing,
  };
}
