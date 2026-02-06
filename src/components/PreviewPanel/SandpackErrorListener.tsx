/**
 * Sandpack error listener component.
 * Monitors Sandpack bundler status and console logs for errors.
 * Integrates with the auto-repair system.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useSandpack } from '@codesandbox/sandpack-react';
import { useErrorMonitor } from '@/hooks/useErrorMonitor';
import { shouldIgnoreError } from '@/shared/types/runtime-error';
import type { AggregatedErrors } from '@/services/ErrorAggregator';

export interface SandpackErrorListenerProps {
  /** Callback when errors are ready for repair */
  onErrorsReady?: (errors: AggregatedErrors) => void;
  /** Whether error monitoring is enabled */
  enabled?: boolean;
  /** Callback when bundler becomes idle (no errors) */
  onBundlerIdle?: () => void;
}

/**
 * Component that listens for Sandpack errors and reports them.
 * Must be rendered inside SandpackProvider.
 */
export function SandpackErrorListener({ 
  onErrorsReady, 
  enabled = true,
  onBundlerIdle 
}: SandpackErrorListenerProps) {
  const { sandpack, listen } = useSandpack();
  const lastBundlerStatus = useRef<string>('');
  const hasReportedError = useRef(false);
  
  const { 
    captureBundlerError, 
    captureConsoleError, 
    clearErrors 
  } = useErrorMonitor({ 
    onErrorsReady, 
    enabled 
  });

  // Handle bundler status changes
  const handleBundlerStatus = useCallback((status: string, message?: string) => {
    // Skip if same status
    if (status === lastBundlerStatus.current) return;
    lastBundlerStatus.current = status;

    if (status === 'error' && message) {
      hasReportedError.current = true;
      captureBundlerError(message);
    } else if (status === 'idle' && hasReportedError.current) {
      // Bundler recovered, clear errors
      hasReportedError.current = false;
      clearErrors();
      onBundlerIdle?.();
    }
  }, [captureBundlerError, clearErrors, onBundlerIdle]);

  // Handle console messages
  const handleConsoleMessage = useCallback((type: string, message: string, stack?: string) => {
    if (!enabled) return;
    
    // Only capture errors
    if (type !== 'error') return;
    
    // Skip ignored patterns
    if (shouldIgnoreError(message)) return;

    captureConsoleError(message, stack);
  }, [enabled, captureConsoleError]);

  // Listen to Sandpack events
  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = listen((msg) => {
      // Handle bundler status
      if (msg.type === 'status') {
        handleBundlerStatus(msg.status);
      }

      // Handle compilation errors
      if (msg.type === 'action' && msg.action === 'show-error') {
        const errorMessage = (msg as { message?: string }).message || 'Build error occurred';
        handleBundlerStatus('error', errorMessage);
      }

      // Handle console logs
      if (msg.type === 'console') {
        const consoleMsg = msg as { log?: Array<{ method: string; data: unknown[] }> };
        if (consoleMsg.log) {
          for (const logItem of consoleMsg.log) {
            if (logItem.method === 'error') {
              const message = logItem.data
                .map(d => {
                  if (typeof d === 'string') return d;
                  if (d instanceof Error) return d.message;
                  try {
                    return JSON.stringify(d);
                  } catch {
                    return String(d);
                  }
                })
                .join(' ');
              
              handleConsoleMessage('error', message);
            }
          }
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [enabled, listen, handleBundlerStatus, handleConsoleMessage]);

  // Also check current bundler status
  useEffect(() => {
    if (!enabled) return;
    
    // Check if there's an active error in the current state
    const error = sandpack.error;
    if (error?.message) {
      handleBundlerStatus('error', error.message);
    }
  }, [enabled, sandpack.error, handleBundlerStatus]);

  // This component doesn't render anything
  return null;
}

export default SandpackErrorListener;
