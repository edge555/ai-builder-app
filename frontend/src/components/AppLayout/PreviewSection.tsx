import type { RuntimeError } from '@ai-app-builder/shared/types';
import { useEffect, useCallback, lazy, Suspense } from 'react';

import { useProjectState, useGenerationState, useGenerationActions, useAutoRepair } from '@/context';
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
  const { resetAutoRepair } = useGenerationActions();
  const { triggerAutoRepair } = useAutoRepair();

  // Use the new handler hook that doesn't cause re-renders on state changes
  const errorHandlers = usePreviewErrorHandlers();

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

  const handleAutoRepair = useCallback(async (_runtimeError: RuntimeError) => {
    try {
      await triggerAutoRepair();
    } catch (error) {
      logger.error('Auto-repair trigger failed', { error });
    }
  }, [triggerAutoRepair]);

  const handleBundlerIdle = useCallback(() => {
    // Only clear when no repair is pending or in-flight.
    // During 'detecting' the 800ms debounce is running; during 'repairing' an AI call is active.
    // In both cases the bundler briefly hits 'idle' between compile cycles — that is NOT a
    // real recovery and clearing here is what causes the red/white blink loop.
    const repairPhase = errorHandlers.getRepairPhase();
    if (repairPhase === 'idle') {
      errorHandlers.clearAllErrors();
    }
  }, [errorHandlers]);

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
