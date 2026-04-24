/**
 * Renderless component that parses WebContainer server/install output for errors
 * and reports them to the existing error aggregation system.
 * Mirrors the integration pattern of SandpackErrorListener.
 */

import { shouldIgnoreError } from '@ai-app-builder/shared';
import { useEffect, useRef, useCallback } from 'react';

import { useErrorMonitor } from '@/hooks/useErrorMonitor';
import type { AggregatedErrors } from '@/services/ErrorAggregator';

/** Fatal signals only. Generic terminal noise should not trigger repair. */
const FATAL_SERVER_PATTERNS = [
  /module not found:/i,
  /failed to compile/i,
  /\[vite\].*failed to resolve import/i,
  /\[vite\].*internal server error/i,
  /error ts\d+/i,
  /build failed/i,
  /cannot find module/i,
  /does not provide an export named/i,
  /unexpected token/i,
  /uncaught (reference|type|syntax)error/i,
];

const FATAL_INSTALL_PATTERNS = [
  /^npm (err!|error) code /i,
  /^npm (err!|error) enoent/i,
  /^npm (err!|error) e404/i,
  /^npm (err!|error) eresolve/i,
  /^npm (err!|error) etarget/i,
];

/** Lines to ignore even if they look bad in isolation. */
const IGNORE_PATTERNS = [
  /^\s*at\s+/,           // stack trace lines
  /npm warn/i,
  /peer dep/i,
  /deprecated/i,
  /funding/i,
];

function looksLikeFatalServerError(line: string): boolean {
  if (IGNORE_PATTERNS.some(p => p.test(line))) return false;
  if (shouldIgnoreError(line)) return false;
  return FATAL_SERVER_PATTERNS.some(p => p.test(line));
}

function looksLikeFatalInstallError(line: string): boolean {
  if (IGNORE_PATTERNS.some(p => p.test(line))) return false;
  return FATAL_INSTALL_PATTERNS.some(p => p.test(line));
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
  const prevInstallOutputRef = useRef('');

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
      .filter(line => looksLikeFatalServerError(line));

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
    const newPart = installOutput.slice(prevInstallOutputRef.current.length);
    prevInstallOutputRef.current = installOutput;

    const errorLines = newPart
      .split('\n')
      .filter(line => looksLikeFatalInstallError(line));

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
      prevInstallOutputRef.current = '';
      clearErrors();
    }
  }, [serverOutput, installOutput, clearErrors]);

  return null;
}

export default WebContainerErrorListener;
