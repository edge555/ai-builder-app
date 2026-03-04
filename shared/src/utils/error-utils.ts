import {
    type RuntimeError,
    type RuntimeErrorType,
    type ErrorPriority,
    type ErrorSource
} from '../types/runtime-error';

/**
 * Sanitizes error messages to prevent API key and sensitive data exposure.
 * Replaces common sensitive patterns with REDACTED placeholders.
 *
 * This utility is used across backend, frontend, and Supabase edge functions.
 *
 * @param message - The error message to sanitize
 * @returns Sanitized error message with sensitive data redacted
 */
export function sanitizeError(message: string): string {
    return message
        .replace(/key=[^&\s"']+/gi, 'key=REDACTED')
        .replace(/apikey=[^&\s"']+/gi, 'apikey=REDACTED')
        .replace(/token=[^&\s"']+/gi, 'token=REDACTED')
        .replace(/secret=[^&\s"']+/gi, 'secret=REDACTED')
        .replace(/password=[^&\s"']+/gi, 'password=REDACTED')
        .replace(/SUPABASE_SERVICE_ROLE_KEY[^&\s"']*/gi, 'SUPABASE_SERVICE_ROLE_KEY=REDACTED')
        .replace(/GEMINI_API_KEY[^&\s"']*/gi, 'GEMINI_API_KEY=REDACTED');
}

/**
 * Priority order for sorting (lower = higher priority).
 */
export const ERROR_PRIORITY_ORDER: Record<ErrorPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
};

/**
 * Delay before auto-repair for each priority level (ms).
 */
export const ERROR_REPAIR_DELAY: Record<ErrorPriority, number> = {
    critical: 0,      // Immediate
    high: 300,        // Brief debounce
    medium: 500,      // Moderate debounce
    low: -1,          // No auto-repair
};

/**
 * Error type to priority mapping.
 */
export const ERROR_TYPE_PRIORITY: Record<RuntimeErrorType, ErrorPriority> = {
    BUILD_ERROR: 'critical',
    IMPORT_ERROR: 'critical',
    UNDEFINED_EXPORT: 'high',
    REFERENCE_ERROR: 'high',
    TYPE_ERROR: 'high',
    RENDER_ERROR: 'high',
    SYNTAX_ERROR: 'high',
    NETWORK_ERROR: 'medium',
    CSS_ERROR: 'medium',
    HYDRATION_ERROR: 'medium',
    PROMISE_ERROR: 'medium',
    UNKNOWN_ERROR: 'medium',
};

/**
 * Patterns to ignore (not real errors or non-critical).
 */
export const IGNORED_ERROR_PATTERNS = [
    /^Warning:/,                          // React dev warnings
    /\[HMR\]/,                            // Hot module reload messages
    /Download the React DevTools/,        // React DevTools suggestion
    /React does not recognize/,           // Prop warnings
    /Each child in a list/,               // Key prop warning (non-breaking)
    /validateDOMNesting/,                 // DOM nesting warning
    /Received .* for a non-boolean/,      // Prop type warnings
    /Invalid DOM property/,               // DOM prop warnings
];

/**
 * Check if an error message should be ignored.
 */
export function shouldIgnoreError(message: string): boolean {
    return IGNORED_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Classifies an error into a RuntimeErrorType based on message and name.
 */
export function classifyRuntimeError(error: Error | string): RuntimeErrorType {
    const message = typeof error === 'string' ? error.toLowerCase() : error.message.toLowerCase();
    const name = typeof error === 'string' ? '' : error.name.toLowerCase();

    // Build/bundler errors
    if (message.includes('failed to resolve') ||
        message.includes('failed to load') ||
        message.includes('bundling error') ||
        message.includes('transform failed')) {
        return 'BUILD_ERROR';
    }

    // Import/module errors
    if (message.includes('cannot find module') ||
        message.includes('module not found') ||
        message.includes("cannot resolve") ||
        message.includes("failed to resolve import")) {
        return 'IMPORT_ERROR';
    }

    // Export errors
    if (message.includes('does not provide an export') ||
        message.includes('is not exported from') ||
        message.includes('named export') ||
        message.includes("doesn't export")) {
        return 'UNDEFINED_EXPORT';
    }

    // Reference errors
    if (name === 'referenceerror' || message.includes('is not defined')) {
        return 'REFERENCE_ERROR';
    }

    // Type errors
    if (name === 'typeerror' ||
        message.includes('cannot read propert') ||
        message.includes('is not a function') ||
        message.includes('undefined is not') ||
        message.includes('null is not')) {
        return 'TYPE_ERROR';
    }

    // Syntax errors
    if (name === 'syntaxerror' ||
        message.includes('unexpected token') ||
        message.includes('parsing error')) {
        return 'SYNTAX_ERROR';
    }

    // CSS errors
    if (message.includes('css') && (message.includes('parse') || message.includes('syntax'))) {
        return 'CSS_ERROR';
    }

    // Network errors
    if (message.includes('fetch') ||
        message.includes('network') ||
        message.includes('cors') ||
        message.includes('failed to load resource')) {
        return 'NETWORK_ERROR';
    }

    // Promise errors
    if (message.includes('unhandled promise') ||
        message.includes('promise') ||
        message.includes('async')) {
        return 'PROMISE_ERROR';
    }

    // Hydration errors
    if (message.includes('hydrat') || message.includes('server-rendered')) {
        return 'HYDRATION_ERROR';
    }

    // React-specific render errors
    if (message.includes('render') ||
        message.includes('component') ||
        message.includes('hook') ||
        message.includes('invalid element')) {
        return 'RENDER_ERROR';
    }

    return 'UNKNOWN_ERROR';
}

/**
 * Parses a stack trace to extract file path, line, and column.
 */
export function parseStackTrace(stack: string): { filePath?: string; line?: number; column?: number } {
    // Match patterns like:
    // - "at Component (src/components/Foo.tsx:42:10)"
    // - "at src/App.tsx:15:5"
    // - "(src/path/File.tsx:42:15)"
    // - "at src/path/File.tsx:42:15"
    const patterns = [
        /at\s+\w+\s+\(([^:)]+):(\d+):(\d+)\)/,
        /at\s+([^:)]+):(\d+):(\d+)/,
        /\(([^:)]+):(\d+):(\d+)\)/,
        /([^:\s]+\.(?:tsx?|jsx?|css)):(\d+):(\d+)/,
    ];

    for (const line of stack.split('\n')) {
        for (const pattern of patterns) {
            const match = line.match(pattern);
            if (match) {
                const filePath = match[1]?.trim();
                const lineNum = parseInt(match[2] ?? '0', 10);
                const colNum = parseInt(match[3] ?? '0', 10);
                // Filter out node_modules and internal paths
                if (filePath &&
                    !filePath.includes('node_modules') &&
                    !filePath.includes('sandpack-client') &&
                    (filePath.includes('src/') || filePath.startsWith('/'))) {
                    return { filePath, line: lineNum, column: colNum };
                }
            }
        }
    }

    return {};
}

/**
 * Gets suggested fixes based on error type.
 */
export function getSuggestedFixes(type: RuntimeErrorType, message: string): string[] {
    switch (type) {
        case 'BUILD_ERROR':
            return [
                'Check for syntax errors in the affected file',
                'Verify all imports are correct',
                'Ensure dependencies are installed',
            ];
        case 'IMPORT_ERROR':
            if (message.toLowerCase().includes('react-icons')) {
                return [
                    "Replace react-icons with lucide-react (already installed)",
                    "Import example: import { Menu } from 'lucide-react'",
                ];
            }
            return [
                'Add the missing package to dependencies',
                'Use an already installed alternative package',
                'Remove or comment out the import temporarily',
            ];
        case 'UNDEFINED_EXPORT':
            return [
                'Check if the export name is correct',
                'Verify the export exists in the source module',
                'Use a named import instead of default import or vice versa',
            ];
        case 'REFERENCE_ERROR':
            return [
                'Check if the variable is defined before use',
                'Add missing imports',
                'Fix typos in variable names',
            ];
        case 'TYPE_ERROR':
            return [
                'Add null/undefined checks before accessing properties',
                'Provide default values: (value || defaultValue)',
                'Use optional chaining: object?.property?.nested',
            ];
        case 'RENDER_ERROR':
            return [
                'Check component props and state initialization',
                'Ensure hooks are called unconditionally at top level',
                'Verify JSX structure is valid',
            ];
        case 'SYNTAX_ERROR':
            return [
                'Fix bracket/parenthesis matching',
                'Close unclosed strings or templates',
                'Check for missing semicolons or commas',
            ];
        case 'CSS_ERROR':
            return [
                'Fix CSS syntax (missing semicolons, brackets)',
                'Verify CSS property names are valid',
                'Check for unclosed rules',
            ];
        case 'NETWORK_ERROR':
            return [
                'Check API endpoint URL',
                'Verify CORS configuration',
                'Add error handling for network requests',
            ];
        case 'HYDRATION_ERROR':
            return [
                'Ensure server and client render the same content',
                'Use useEffect for client-only code',
                'Check for conditional rendering based on browser APIs',
            ];
        default:
            return [
                'Check for undefined values',
                'Verify imports are correct',
                'Ensure proper error handling',
            ];
    }
}

/**
 * Creates a RuntimeError from a caught Error and optional component stack.
 */
export function createRuntimeError(
    error: Error | string,
    source: ErrorSource = 'error_boundary',
    componentStack?: string
): RuntimeError {
    const message = typeof error === 'string' ? error : error.message;
    const stack = typeof error === 'string' ? undefined : error.stack;

    const type = classifyRuntimeError(error);
    const priority = ERROR_TYPE_PRIORITY[type];
    const stackInfo = stack ? parseStackTrace(stack) : {};
    const suggestedFixes = getSuggestedFixes(type, message);

    return {
        message,
        stack,
        componentStack,
        filePath: stackInfo.filePath,
        line: stackInfo.line,
        column: stackInfo.column,
        type,
        priority,
        timestamp: new Date().toISOString(),
        source,
        suggestedFixes,
        rawError: error,
    };
}

/**
 * Parses a bundler error message to extract structured info.
 */
export function parseBundlerError(message: string): Partial<RuntimeError> {
    const type = classifyRuntimeError(message);
    const priority = ERROR_TYPE_PRIORITY[type];
    const stackInfo = parseStackTrace(message);

    return {
        message,
        type,
        priority,
        source: 'bundler',
        filePath: stackInfo.filePath,
        line: stackInfo.line,
        column: stackInfo.column,
        suggestedFixes: getSuggestedFixes(type, message),
        timestamp: new Date().toISOString(),
    };
}

/**
 * Generates a unique key for error deduplication.
 */
export function getErrorKey(error: RuntimeError): string {
    return `${error.type}:${error.message.slice(0, 100)}:${error.filePath || ''}:${error.line || ''}`;
}
