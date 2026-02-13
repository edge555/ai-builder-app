/**
 * Logging Service
 *
 * Provides structured logging with configurable log levels.
 * Supports debug, info, warn, and error levels with ISO timestamps.
 * Includes request correlation ID support for distributed tracing.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;

  /**
   * Creates a child logger with the given request ID automatically added to all log entries
   */
  withRequestId(requestId: string): Logger;
}

// Log level hierarchy for filtering
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Get the configured log level from environment variable
 * Defaults to 'info' if not set or invalid
 */
function getConfiguredLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  
  if (envLevel && envLevel in LOG_LEVELS) {
    return envLevel as LogLevel;
  }
  
  return 'info';
}

/**
 * Format a log message with ISO timestamp and level indicator
 */
function formatMessage(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  requestId?: string
): string {
  const timestamp = new Date().toISOString();
  const levelUpper = level.toUpperCase().padEnd(5);

  // Include request ID in message if provided
  const requestIdPrefix = requestId ? `[${requestId}] ` : '';
  let formatted = `[${timestamp}] ${levelUpper} ${requestIdPrefix}${message}`;

  if (context && Object.keys(context).length > 0) {
    // For debug level, pretty-print large string values for readability
    if (level === 'debug') {
      const prettyContext: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(context)) {
        // If value is a string longer than 200 chars, format it nicely
        if (typeof value === 'string' && value.length > 200) {
          prettyContext[key] = '\n' + value;
        } else {
          prettyContext[key] = value;
        }
      }
      formatted += '\n' + JSON.stringify(prettyContext, null, 2);
    } else {
      formatted += ` ${JSON.stringify(context)}`;
    }
  }

  return formatted;
}

/**
 * Create a logger instance with the specified name and optional request ID
 */
export function createLogger(name: string, requestId?: string): Logger {
  const configuredLevel = getConfiguredLogLevel();
  const minLevel = LOG_LEVELS[configuredLevel];

  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVELS[level] >= minLevel;
  };

  return {
    debug(message: string, context?: Record<string, unknown>): void {
      if (shouldLog('debug')) {
        console.log(formatMessage('debug', `[${name}] ${message}`, context, requestId));
      }
    },

    info(message: string, context?: Record<string, unknown>): void {
      if (shouldLog('info')) {
        console.log(formatMessage('info', `[${name}] ${message}`, context, requestId));
      }
    },

    warn(message: string, context?: Record<string, unknown>): void {
      if (shouldLog('warn')) {
        console.warn(formatMessage('warn', `[${name}] ${message}`, context, requestId));
      }
    },

    error(message: string, context?: Record<string, unknown>): void {
      if (shouldLog('error')) {
        console.error(formatMessage('error', `[${name}] ${message}`, context, requestId));
      }
    },

    withRequestId(newRequestId: string): Logger {
      return createLogger(name, newRequestId);
    },
  };
}

/**
 * Default logger instance for general use
 */
export const logger = createLogger('app');
