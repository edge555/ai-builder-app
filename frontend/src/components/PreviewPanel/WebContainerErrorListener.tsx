/**
 * Renderless component that parses WebContainer server/install output for errors
 * and reports them to the existing error aggregation system.
 * Mirrors the integration pattern of SandpackErrorListener.
 */

import { shouldIgnoreError } from '@ai-app-builder/shared';
import { useEffect, useRef, useCallback } from 'react';

import { useErrorMonitor } from '@/hooks/useErrorMonitor';
import type { AggregatedErrors } from '@/services/ErrorAggregator';

/** Patterns that indicate a build/runtime error in Vite or Next.js output. */
const ERROR_PATTERNS = [
  /plugin error:/i,
  /module not found:/i,
  /failed to compile/i,
  /\[vite\].*error/i,
  /error ts\d+/i,
  /build failed/i,
  /cannot find module/i,
];

/** Lines to ignore even if they look like errors. */
const IGNORE_PATTERNS = [
  /^\s*at\s+/,           // stack trace lines
  /npm warn/i,
  /peer dep/i,
];

function looksLikeError(line: string): boolean {
  if (IGNORE_PATTERNS.some(p => p.test(line))) return false;
  if (ERROR_PATTERNS.some(p => p.test(line))) return true;
  // Generic error keyword check
  if (/\berror\b/i.test(line) && !shouldIgnoreError(line)) return true;
  return false;
}

export interface WebContainerErrorListenerProps {
  /** Combined terminal output to scan for errors. */
  serverOutput: string;
  installOutput: string;
  /** Callback when errors are ready for repair */
  onErrorsReady?: (errors: AggregatedErrors) => void;
  /** Whether error monitoring is enabled */
  enabled?: boolean;
  /** Callback when there are no errors (server started cleanly) */
  onBundlerIdle?: () => void;
  /** Whether the dev server has reached the ready phase */
  isReady?: boolean;
}

/**
 * Renderless component that integrates WebContainer output with the auto-repair error pipeline.
 */
export function WebContainerErrorListener({
  serverOutput,
  installOutput,
  onErrorsReady,
  enabled = true,
  onBundlerIdle,
  isReady = false,
}: WebContainerErrorListenerProps) {
  const { captureBundlerError, clearErrors } = useErrorMonitor({
    onErrorsReady,
    enabled,
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasReportedError = useRef(false);
  const prevOutputRef = useRef('');

  // When dev server becomes ready with no errors, signal bundler idle
  const isReadyRef = useRef(isReady);
  useEffect(() => {
    isReadyRef.current = isReady;
  }, [isReady]);

  useEffect(() => {
    if (!isReady) return;
    if (!hasReportedError.current) {
      onBundlerIdle?.();
    }
  }, [isReady, onBundlerIdle]);

  const scanOutput = useCallback((output: string) => {
    if (!enabled) return;

    // Only scan newly appended lines
    const newPart = output.slice(prevOutputRef.current.length);
    prevOutputRef.current = output;

    if (!newPart) return;

    const errorLines = newPart
      .split('\n')
      .filter(line => looksLikeError(line));

    if (errorLines.length === 0) return;

    // Debounce: Vite prints multi-line errors in rapid succession
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const message = errorLines.join('\n');
      hasReportedError.current = true;
      captureBundlerError(message);
    }, 1500);
  }, [enabled, captureBundlerError]);

  // Scan server output for errors
  useEffect(() => {
    scanOutput(serverOutput);
  }, [serverOutput, scanOutput]);

  // Scan install output for errors (npm install failures)
  useEffect(() => {
    if (!enabled || !installOutput) return;
    const errorLines = installOutput
      .split('\n')
      .filter(line => /npm err/i.test(line));

    if (errorLines.length > 0) {
      hasReportedError.current = true;
      captureBundlerError(errorLines.join('\n'));
    }
  }, [installOutput, enabled, captureBundlerError]);

  // Clear errors when output resets (new generation)
  useEffect(() => {
    if (!serverOutput && !installOutput) {
      hasReportedError.current = false;
      prevOutputRef.current = '';
      clearErrors();
    }
  }, [serverOutput, installOutput, clearErrors]);

  return null;
}

export default WebContainerErrorListener;
