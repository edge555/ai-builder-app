/**
 * Logging Service
 *
 * Provides structured logging with configurable log levels.
 * Supports debug, info, warn, and error levels with ISO timestamps.
 * Includes request correlation ID support for distributed tracing.
 * Supports JSON output format and sensitive data redaction.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogCategory = 'ai' | 'api' | 'core' | 'diff' | 'analysis' | 'streaming';

export type LogFormat = 'text' | 'json';

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;

  /**
   * Category-specific logging methods
   */
  ai(message: string, context?: Record<string, unknown>): void;
  api(message: string, context?: Record<string, unknown>): void;
  core(message: string, context?: Record<string, unknown>): void;
  diff(message: string, context?: Record<string, unknown>): void;
  analysis(message: string, context?: Record<string, unknown>): void;
  streaming(message: string, context?: Record<string, unknown>): void;

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

// Sensitive field patterns for redaction
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /password/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /bearer\s+\S+/i,
  /access[_-]?key/i,
  /private[_-]?key/i,
  /client[_-]?secret/i,
];


const CACHED_LOG_FORMAT: LogFormat = (() => {
  const envFormat = process.env.LOG_FORMAT?.toLowerCase();
  if (envFormat === 'json') {
    return 'json';
  }
  return 'text';
})();

const CACHED_CATEGORIES: Set<LogCategory> = (() => {
  const envCategories = process.env.LOG_CATEGORIES?.toLowerCase();
  if (envCategories) {
    const validCategories: LogCategory[] = ['ai', 'api', 'core', 'diff', 'analysis', 'streaming'];
    const categories = new Set<LogCategory>();
    for (const cat of envCategories.split(',')) {
      const trimmed = cat.trim() as LogCategory;
      if (validCategories.includes(trimmed)) {
        categories.add(trimmed);
      }
    }
    return categories;
  }
  // Return all categories if none specified
  return new Set<LogCategory>(['ai', 'api', 'core', 'diff', 'analysis', 'streaming']);
})();

/**
 * Redact sensitive data from context objects
 */
function redactSensitiveData(obj: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Check if key matches any sensitive pattern
    const isSensitive = SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));

    if (isSensitive) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively redact nested objects
      redacted[key] = redactSensitiveData(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      // Recursively redact array items
      redacted[key] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? redactSensitiveData(item as Record<string, unknown>)
          : item
      );
    } else if (typeof value === 'string') {
      // Check for sensitive patterns in string values
      let redactedValue = value;
      for (const pattern of SENSITIVE_PATTERNS) {
        redactedValue = redactedValue.replace(pattern, '[REDACTED]');
      }
      redacted[key] = redactedValue;
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Format a log message in JSON format
 */
function formatJsonMessage(
  level: LogLevel,
  service: string,
  message: string,
  context?: Record<string, unknown>,
  requestId?: string,
  category?: LogCategory,
  stackTrace?: string
): string {
  const logEntry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    service,
    message,
  };

  if (requestId) {
    logEntry.requestId = requestId;
  }

  if (category) {
    logEntry.category = category;
  }

  if (context && Object.keys(context).length > 0) {
    logEntry.context = redactSensitiveData(context);
  }

  if (stackTrace) {
    logEntry.stackTrace = stackTrace;
  }

  return JSON.stringify(logEntry);
}

/**
 * Format a log message in human-readable text format
 */
function formatTextMessage(
  level: LogLevel,
  service: string,
  message: string,
  context?: Record<string, unknown>,
  requestId?: string,
  category?: LogCategory,
  stackTrace?: string
): string {
  const timestamp = new Date().toISOString();
  const levelUpper = level.toUpperCase().padEnd(5);

  // Include service, request ID, and category in message
  const servicePrefix = `[${service}]`;
  const categoryPrefix = category ? `[${category}]` : '';
  const requestIdPrefix = requestId ? `[${requestId}]` : '';

  let formatted = `[${timestamp}] ${levelUpper} ${servicePrefix} ${categoryPrefix} ${requestIdPrefix} ${message}`;

  // Add stack trace for errors
  if (stackTrace) {
    formatted += '\n' + stackTrace;
  }

  if (context && Object.keys(context).length > 0) {
    // Redact sensitive data before displaying
    const safeContext = redactSensitiveData(context);

    // For debug level, pretty-print large string values for readability
    if (level === 'debug') {
      const prettyContext: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(safeContext)) {
        // If value is a string longer than 200 chars, format it nicely
        if (typeof value === 'string' && value.length > 200) {
          prettyContext[key] = '\n' + value;
        } else {
          prettyContext[key] = value;
        }
      }
      formatted += '\n' + JSON.stringify(prettyContext, null, 2);
    } else {
      formatted += ` ${JSON.stringify(safeContext)}`;
    }
  }

  return formatted;
}

/**
 * Format a log message based on configured format
 */
function formatMessage(
  level: LogLevel,
  service: string,
  message: string,
  context?: Record<string, unknown>,
  requestId?: string,
  category?: LogCategory,
  stackTrace?: string
): string {
  if (CACHED_LOG_FORMAT === 'json') {
    return formatJsonMessage(level, service, message, context, requestId, category, stackTrace);
  }
  return formatTextMessage(level, service, message, context, requestId, category, stackTrace);
}

/**
 * Check if a category should be logged based on configuration
 */
function shouldLogCategory(category: LogCategory): boolean {
  return CACHED_CATEGORIES.has(category);
}

/**
 * Create a logger instance with the specified name and optional request ID
 */
export function createLogger(name: string, requestId?: string): Logger {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  const activeLogLevel: LogLevel = (envLevel && envLevel in LOG_LEVELS) ? envLevel as LogLevel : 'info';
  const minLevel = LOG_LEVELS[activeLogLevel];

  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVELS[level] >= minLevel;
  };

  const log = (level: LogLevel, category: LogCategory | undefined, message: string, context?: Record<string, unknown>): void => {
    // Check category filter if category is specified
    if (category && !shouldLogCategory(category)) {
      return;
    }

    if (!shouldLog(level)) {
      return;
    }

    // Extract stack trace from error in context
    let stackTrace: string | undefined;
    if (level === 'error' && context?.error) {
      const error = context.error as Error;
      stackTrace = error.stack;
      // Remove error from context to avoid duplication
      context = { ...context };
      delete context.error;
    }

    const formattedMessage = formatMessage(level, name, message, context, requestId, category, stackTrace);

    if (level === 'error') {
      console.error(formattedMessage);
    } else if (level === 'warn') {
      console.warn(formattedMessage);
    } else {
      console.log(formattedMessage);
    }
  };

  return {
    debug(message: string, context?: Record<string, unknown>): void {
      log('debug', undefined, message, context);
    },

    info(message: string, context?: Record<string, unknown>): void {
      log('info', undefined, message, context);
    },

    warn(message: string, context?: Record<string, unknown>): void {
      log('warn', undefined, message, context);
    },

    error(message: string, context?: Record<string, unknown>): void {
      log('error', undefined, message, context);
    },

    // Category-specific methods
    ai(message: string, context?: Record<string, unknown>): void {
      log('info', 'ai', message, context);
    },

    api(message: string, context?: Record<string, unknown>): void {
      log('info', 'api', message, context);
    },

    core(message: string, context?: Record<string, unknown>): void {
      log('info', 'core', message, context);
    },

    diff(message: string, context?: Record<string, unknown>): void {
      log('info', 'diff', message, context);
    },

    analysis(message: string, context?: Record<string, unknown>): void {
      log('info', 'analysis', message, context);
    },

    streaming(message: string, context?: Record<string, unknown>): void {
      log('info', 'streaming', message, context);
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

