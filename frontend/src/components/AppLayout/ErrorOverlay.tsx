/**
 * ErrorOverlay component.
 * Displays repair status independently from PreviewSection.
 * Subscribes only to error state to avoid unnecessary re-renders of preview.
 */

import { RepairStatus } from '@/components/RepairStatus';
import { usePreviewErrorState, usePreviewErrorActions } from '@/context';

/**
 * Overlay component that displays error/repair status.
 * Separated from PreviewSection to prevent error state changes from re-rendering the preview.
 */
export function ErrorOverlay() {
  const {
    repairPhase,
    repairAttempts,
    maxRepairAttempts,
    aggregatedErrors,
  } = usePreviewErrorState();

  const { dismissRepairStatus } = usePreviewErrorActions();

  // Get current file being repaired for display
  const currentFile = aggregatedErrors?.affectedFiles[0];

  return (
    <RepairStatus
      phase={repairPhase}
      attempt={repairAttempts}
      maxAttempts={maxRepairAttempts}
      errorCount={aggregatedErrors?.totalCount || 1}
      currentFile={currentFile}
      onDismiss={dismissRepairStatus}
    />
  );
}
