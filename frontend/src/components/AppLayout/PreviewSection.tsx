import type { RuntimeError } from '@ai-app-builder/shared/types';
import { useEffect, useCallback, useRef, lazy, Suspense } from 'react';

import { useProjectState, useGenerationState, useGenerationActions } from '@/context';
import { usePreviewErrorHandlers } from '@/hooks/usePreviewErrorHandlers';
import type { AggregatedErrors } from '@/services/ErrorAggregator';
import { createLogger } from '@/utils/logger';

import type { ActivePanel } from '../PanelToggle';
import { PreviewErrorBoundary } from '../PreviewPanel/PreviewErrorBoundary';
import { PreviewSkeleton } from '../PreviewPanel/PreviewSkeleton';

import { ErrorOverlay } from './ErrorOverlay';

const PreviewPanel = lazy(() => import('../PreviewPanel/PreviewPanel'));

const logger = createLogger('PreviewSection');

export interface PreviewSectionProps {
  activePanel: ActivePanel;
}

/**
 * Preview section component that handles error monitoring and auto-repair.
 * Wraps PreviewPanel with error boundary and manages error state.
 */
export function PreviewSection({ activePanel }: PreviewSectionProps) {
  const { projectState } = useProjectState();
  const { isLoading, loadingPhase, isAutoRepairing } = useGenerationState();
  const { autoRepair, resetAutoRepair } = useGenerationActions();

  // Use the new handler hook that doesn't cause re-renders on state changes
  const errorHandlers = usePreviewErrorHandlers();

  // Store project state in ref for use in callbacks
  const projectStateRef = useRef(projectState);
  useEffect(() => {
    projectStateRef.current = projectState;
  }, [projectState]);

  // Reset auto-repair attempts when project state changes successfully
  useEffect(() => {
    const repairPhase = errorHandlers.getRepairPhase();
    if (repairPhase === 'idle' || repairPhase === 'success') {
      resetAutoRepair();
    }
  }, [projectState?.currentVersionId, errorHandlers, resetAutoRepair]);

  const handlePreviewError = useCallback((runtimeError: RuntimeError) => {
    logger.error('Preview error captured', {
      type: runtimeError.type,
      message: runtimeError.message
    });
    errorHandlers.reportError(runtimeError);
  }, [errorHandlers]);

  const handleErrorsReady = useCallback((errors: AggregatedErrors) => {
    logger.info('Errors ready for repair', { totalCount: errors.totalCount });
    errorHandlers.reportAggregatedErrors(errors);
  }, [errorHandlers]);

  const handleAutoRepair = useCallback(async (runtimeError: RuntimeError) => {
    if (!errorHandlers.shouldAutoRepair()) {
      return;
    }

    errorHandlers.startAutoRepair();

    try {
      const success = await autoRepair(runtimeError, projectStateRef.current);
      errorHandlers.completeAutoRepair(success);
    } catch (error) {
      logger.error('Auto-repair failed', { error });
      errorHandlers.completeAutoRepair(false);
    }
  }, [autoRepair, errorHandlers]);

  const handleBundlerIdle = useCallback(() => {
    // Bundler recovered, clear errors
    const repairPhase = errorHandlers.getRepairPhase();
    if (repairPhase !== 'repairing') {
      errorHandlers.clearAllErrors();
      errorHandlers.setRepairPhase('idle');
    }
  }, [errorHandlers]);

  // Auto-trigger repair when errors are ready and repair phase is 'repairing'
  useEffect(() => {
    const repairPhase = errorHandlers.getRepairPhase();
    const aggregatedErrors = errorHandlers.getAggregatedErrors();
    const isAutoRepairingCurrent = errorHandlers.getIsAutoRepairing();

    if (repairPhase === 'repairing' && aggregatedErrors && aggregatedErrors.totalCount > 0 && !isAutoRepairingCurrent) {
      const firstError = aggregatedErrors.errors[0];
      if (firstError) {
        handleAutoRepair(firstError);
      }
    }
  }, [errorHandlers, handleAutoRepair]);

  // Determine if auto-repair button should be available
  const canAutoRepair = projectState !== null;

  return (
    <>
      <PreviewErrorBoundary
        onError={handlePreviewError}
        onAutoRepair={handleAutoRepair}
        canAutoRepair={canAutoRepair}
        isAutoRepairing={isAutoRepairing}
      >
        <Suspense fallback={loadingPhase !== 'idle' ? <PreviewSkeleton phase={loadingPhase} /> : null}>
          <PreviewPanel
            projectState={projectState}
            isLoading={isLoading}
            loadingPhase={loadingPhase}
            onErrorsReady={handleErrorsReady}
            errorMonitoringEnabled={!isLoading && projectState !== null}
            onBundlerIdle={handleBundlerIdle}
            forceCodeView={activePanel === 'code'}
          />
        </Suspense>
      </PreviewErrorBoundary>

      {/* Error overlay displays repair status independently */}
      <ErrorOverlay />
    </>
  );
}
