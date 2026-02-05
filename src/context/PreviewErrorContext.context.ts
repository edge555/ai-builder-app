import { createContext, useContext } from 'react';
import type { RuntimeError } from '@/shared';

/**
 * State for preview error tracking.
 */
export interface PreviewErrorState {
    /** Current runtime error if any */
    currentError: RuntimeError | null;
    /** Whether auto-repair is in progress */
    isAutoRepairing: boolean;
    /** Number of repair attempts made */
    repairAttempts: number;
    /** Maximum repair attempts allowed */
    maxRepairAttempts: number;
}

/**
 * Actions for preview error management.
 */
export interface PreviewErrorActions {
    /** Report a runtime error from the preview */
    reportError: (error: RuntimeError) => void;
    /** Clear the current error */
    clearError: () => void;
    /** Mark auto-repair as started */
    startAutoRepair: () => void;
    /** Mark auto-repair as completed */
    completeAutoRepair: (success: boolean) => void;
    /** Reset repair attempts counter */
    resetRepairAttempts: () => void;
    /** Check if we should attempt auto-repair */
    shouldAutoRepair: () => boolean;
}

export type PreviewErrorContextValue = PreviewErrorState & PreviewErrorActions;

export const PreviewErrorContext = createContext<PreviewErrorContextValue | null>(null);

/**
 * Hook to access preview error context.
 */
export function usePreviewError(): PreviewErrorContextValue {
    const context = useContext(PreviewErrorContext);
    if (!context) {
        throw new Error('usePreviewError must be used within a PreviewErrorProvider');
    }
    return context;
}
