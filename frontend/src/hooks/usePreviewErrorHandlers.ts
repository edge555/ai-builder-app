/**
 * Hook for preview error handlers with stable callbacks.
 * Uses refs internally to avoid re-renders when error state changes.
 */

import type { RuntimeError } from '@ai-app-builder/shared/types';
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

  // Getter functions for state values (using refs)
  const getRepairPhase = useCallback(() => {
    return stateRef.current.repairPhase;
  }, []);

  return {
    // Stable action callbacks
    reportError,
    reportAggregatedErrors,
    clearAllErrors,
    setRepairPhase,

    // Getter functions for state (returns current value without subscribing)
    getRepairPhase,
  };
}
