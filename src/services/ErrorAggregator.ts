/**
 * ErrorAggregator service for collecting, deduplicating, and prioritizing errors.
 * Provides a single point for error aggregation before repair.
 */

import { 
  type RuntimeError, 
  ERROR_PRIORITY_ORDER, 
  getErrorKey,
  ERROR_REPAIR_DELAY 
} from '@/shared/types/runtime-error';

export interface AggregatedErrors {
  /** All unique errors, sorted by priority */
  errors: RuntimeError[];
  /** Count of errors by type */
  countByType: Record<string, number>;
  /** Affected files */
  affectedFiles: string[];
  /** Whether any critical errors exist */
  hasCriticalErrors: boolean;
  /** Total error count */
  totalCount: number;
}

/**
 * Aggregates and manages errors for repair.
 */
export class ErrorAggregator {
  private errorMap: Map<string, RuntimeError> = new Map();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private onFlush: ((errors: AggregatedErrors) => void) | null = null;

  /**
   * Set the callback for when errors are flushed.
   */
  setFlushCallback(callback: (errors: AggregatedErrors) => void): void {
    this.onFlush = callback;
  }

  /**
   * Add an error to the queue.
   * Returns true if this is a new error.
   */
  addError(error: RuntimeError): boolean {
    const key = getErrorKey(error);
    
    // Skip if we already have this exact error
    if (this.errorMap.has(key)) {
      return false;
    }

    this.errorMap.set(key, error);
    this.scheduleFlush(error.priority);
    return true;
  }

  /**
   * Schedule a flush based on error priority.
   */
  private scheduleFlush(priority: RuntimeError['priority']): void {
    const delay = ERROR_REPAIR_DELAY[priority];
    
    // Low priority errors don't trigger auto-repair
    if (delay < 0) return;

    // Clear existing timer if we're scheduling a more urgent flush
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    // For critical errors, flush immediately
    if (delay === 0) {
      this.flush();
      return;
    }

    // Schedule delayed flush
    this.debounceTimer = setTimeout(() => {
      this.flush();
    }, delay);
  }

  /**
   * Flush all queued errors and trigger the callback.
   */
  flush(): AggregatedErrors {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const errors = Array.from(this.errorMap.values());
    
    // Sort by priority (critical first)
    errors.sort((a, b) => 
      ERROR_PRIORITY_ORDER[a.priority] - ERROR_PRIORITY_ORDER[b.priority]
    );

    // Build aggregated result
    const countByType: Record<string, number> = {};
    const affectedFilesSet = new Set<string>();
    let hasCriticalErrors = false;

    for (const error of errors) {
      countByType[error.type] = (countByType[error.type] || 0) + 1;
      if (error.filePath) {
        affectedFilesSet.add(error.filePath);
      }
      if (error.priority === 'critical') {
        hasCriticalErrors = true;
      }
    }

    const result: AggregatedErrors = {
      errors,
      countByType,
      affectedFiles: Array.from(affectedFilesSet),
      hasCriticalErrors,
      totalCount: errors.length,
    };

    // Trigger callback if we have errors
    if (errors.length > 0 && this.onFlush) {
      this.onFlush(result);
    }

    return result;
  }

  /**
   * Clear all errors (e.g., after successful repair).
   */
  clear(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.errorMap.clear();
  }

  /**
   * Get current error count.
   */
  getCount(): number {
    return this.errorMap.size;
  }

  /**
   * Check if there are any pending errors.
   */
  hasErrors(): boolean {
    return this.errorMap.size > 0;
  }

  /**
   * Get errors without flushing.
   */
  getErrors(): RuntimeError[] {
    return Array.from(this.errorMap.values());
  }

  /**
   * Build a formatted error report for the AI prompt.
   */
  buildErrorReport(includeContext?: Record<string, string>): string {
    const errors = this.getErrors().sort((a, b) => 
      ERROR_PRIORITY_ORDER[a.priority] - ERROR_PRIORITY_ORDER[b.priority]
    );

    if (errors.length === 0) {
      return '';
    }

    const lines: string[] = [
      '=== AUTO-REPAIR REQUEST ===',
      '',
      `Errors Detected: ${errors.length}`,
      '',
    ];

    errors.forEach((error, index) => {
      lines.push(`--- ERROR ${index + 1} (${error.priority.toUpperCase()}) ---`);
      lines.push(`Type: ${error.type}`);
      lines.push(`Message: ${error.message}`);
      
      if (error.filePath) {
        lines.push(`File: ${error.filePath}${error.line ? `:${error.line}` : ''}`);
      }

      if (error.suggestedFixes && error.suggestedFixes.length > 0) {
        lines.push('');
        lines.push('Suggested fixes:');
        error.suggestedFixes.forEach(fix => {
          lines.push(`- ${fix}`);
        });
      }

      // Include file context if available
      if (includeContext && error.filePath && includeContext[error.filePath]) {
        const fileContent = includeContext[error.filePath];
        const fileLines = fileContent.split('\n');
        
        if (error.line && error.line > 0) {
          const startLine = Math.max(0, error.line - 3);
          const endLine = Math.min(fileLines.length, error.line + 3);
          
          lines.push('');
          lines.push('Code context:');
          for (let i = startLine; i < endLine; i++) {
            const lineNum = i + 1;
            const prefix = lineNum === error.line ? '> ' : '  ';
            lines.push(`${prefix}${lineNum.toString().padStart(3)} | ${fileLines[i]}`);
          }
        }
      }

      lines.push('');
    });

    lines.push('--- INSTRUCTIONS ---');
    lines.push('1. Fix all errors in priority order (critical first)');
    lines.push('2. Prefer using already installed dependencies over adding new ones');
    lines.push('3. Apply minimal changes to fix issues');
    lines.push('4. Do not introduce new features, only fix errors');
    lines.push('5. Ensure the project compiles and runs after fixes');

    return lines.join('\n');
  }
}

// Singleton instance for global use
export const errorAggregator = new ErrorAggregator();
