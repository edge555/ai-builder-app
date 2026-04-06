import { createContext, useContext } from 'react';

/**
 * Auto-repair context value.
 * Coordinates preview error detection with the generation repair action.
 */
export interface AutoRepairContextValue {
    /**
     * Trigger auto-repair for the current errors.
     * Returns true if repair was initiated successfully.
     */
    triggerAutoRepair: () => Promise<boolean>;
}

export const AutoRepairContext = createContext<AutoRepairContextValue | null>(null);

/**
 * Hook to access the auto-repair context.
 * Must be used within an AutoRepairProvider.
 */
export function useAutoRepair(): AutoRepairContextValue {
    const context = useContext(AutoRepairContext);
    if (!context) {
        throw new Error('useAutoRepair must be used within an AutoRepairProvider');
    }
    return context;
}
