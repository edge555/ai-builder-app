/* eslint-disable no-console */
/**
 * Frontend Logging Service
 * 
 * Provides structured, leveled logging for the client side.
 * Supports debug, info, warn, and error levels with timestamps and module names.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
}

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

/**
 * Get the configured log level from environment variable.
 * In development, defaults to 'debug'.
 * In production, defaults to 'warn'.
 */
function getConfiguredLogLevel(): LogLevel {
    // Use Vite's import.meta.env for environment variables
    const envLevel = import.meta.env.VITE_LOG_LEVEL?.toLowerCase();

    if (envLevel && envLevel in LOG_LEVELS) {
        return envLevel as LogLevel;
    }

    // Hardcoded default based on mode
    return import.meta.env.DEV ? 'debug' : 'warn';
}

/**
 * Format a log message with ISO timestamp and level indicator.
 */
function formatMessage(
    level: LogLevel,
    name: string,
    message: string,
    context?: Record<string, unknown>
): { message: string; args: any[] } {
    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase().padEnd(5);
    const prefix = `[${timestamp}] ${levelUpper} [${name}] ${message}`;

    const args: any[] = [];
    if (context && Object.keys(context).length > 0) {
        args.push(context);
    }

    return { message: prefix, args };
}

/**
 * Create a logger instance with the specified module name.
 */
export function createLogger(name: string): Logger {
    const configuredLevel = getConfiguredLogLevel();
    const minLevelNum = LOG_LEVELS[configuredLevel];

    const shouldLog = (level: LogLevel): boolean => {
        return LOG_LEVELS[level] >= minLevelNum;
    };

    return {
        debug(message: string, context?: Record<string, unknown>): void {
            if (shouldLog('debug')) {
                const { message: msg, args } = formatMessage('debug', name, message, context);
                console.debug(msg, ...args);
            }
        },

        info(message: string, context?: Record<string, unknown>): void {
            if (shouldLog('info')) {
                const { message: msg, args } = formatMessage('info', name, message, context);
                console.info(msg, ...args);
            }
        },

        warn(message: string, context?: Record<string, unknown>): void {
            if (shouldLog('warn')) {
                const { message: msg, args } = formatMessage('warn', name, message, context);
                console.warn(msg, ...args);
            }
        },

        error(message: string, context?: Record<string, unknown>): void {
            if (shouldLog('error')) {
                const { message: msg, args } = formatMessage('error', name, message, context);
                console.error(msg, ...args);
            }
        },
    };
}

/**
 * Default logger instance for general use
 */
export const logger = createLogger('app');
