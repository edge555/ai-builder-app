 import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
 import type { RuntimeError } from '@/shared';
 
 /**
  * State for preview error tracking.
  */
 interface PreviewErrorState {
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
 interface PreviewErrorActions {
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
 
 type PreviewErrorContextValue = PreviewErrorState & PreviewErrorActions;
 
 const PreviewErrorContext = createContext<PreviewErrorContextValue | null>(null);
 
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