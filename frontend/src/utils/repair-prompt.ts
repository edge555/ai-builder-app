import type { RuntimeError } from '@/shared';
import { errorAggregator } from '@/services/ErrorAggregator';

/**
 * Builds a repair prompt for a runtime error or aggregated errors.
 */
export function buildRepairPrompt(runtimeError: RuntimeError, projectFiles?: Record<string, string>): string {
    // Check if we have aggregated errors
    const aggregatedReport = errorAggregator.buildErrorReport(projectFiles);

    if (aggregatedReport) {
        return aggregatedReport;
    }

    // Fallback to single error prompt
    const parts = [
        `Fix the following runtime error that crashed the application preview:`,
        ``,
        `Error Type: ${runtimeError.type}`,
        `Error Message: ${runtimeError.message}`,
    ];

    if (runtimeError.filePath) {
        parts.push(`File: ${runtimeError.filePath}`);
    }
    if (runtimeError.line) {
        parts.push(`Line: ${runtimeError.line}`);
    }
    if (runtimeError.componentStack) {
        parts.push(``, `Component Stack:`, runtimeError.componentStack.slice(0, 500));
    }
    if (runtimeError.stack) {
        parts.push(``, `Stack Trace:`, runtimeError.stack.slice(0, 800));
    }

    // Add suggested fixes from the error
    if (runtimeError.suggestedFixes && runtimeError.suggestedFixes.length > 0) {
        parts.push(``, `Suggested fixes:`);
        runtimeError.suggestedFixes.forEach(fix => {
            parts.push(`- ${fix}`);
        });
    } else {
        parts.push(
            ``,
            `Common fixes for ${runtimeError.type}:`,
            ...getRepairHints(runtimeError.type)
        );
    }

    parts.push(
        ``,
        `IMPORTANT: Apply the minimal fix needed to resolve this error.`,
        `Ensure the project compiles and runs after the fix.`
    );

    return parts.join('\n');
}

/**
 * Returns repair hints based on error type.
 */
export function getRepairHints(errorType: RuntimeError['type']): string[] {
    switch (errorType) {
        case 'BUILD_ERROR':
            return [
                '- Check for syntax errors in the affected file',
                '- Verify all imports are correct',
                '- Ensure TypeScript/JSX syntax is valid',
            ];
        case 'IMPORT_ERROR':
            return [
                '- Check if the module path is correct',
                '- Use an already installed alternative (lucide-react instead of react-icons)',
                '- Remove the import if not essential',
            ];
        case 'UNDEFINED_EXPORT':
            return [
                '- Verify the export name matches what the module provides',
                '- Check for typos in the import name',
                '- Use default import if named export does not exist',
            ];
        case 'REFERENCE_ERROR':
            return [
                '- Check if the variable is defined before use',
                '- Add missing imports',
                '- Fix typos in variable names',
            ];
        case 'TYPE_ERROR':
            return [
                '- Add null/undefined checks before accessing properties',
                '- Provide default values for optional properties',
                '- Ensure functions are called correctly',
            ];
        case 'RENDER_ERROR':
            return [
                '- Check component props and state initialization',
                '- Ensure hooks are called unconditionally',
                '- Verify JSX structure is valid',
            ];
        case 'SYNTAX_ERROR':
            return [
                '- Fix bracket matching',
                '- Close unclosed strings',
                '- Check for missing semicolons or commas',
            ];
        case 'CSS_ERROR':
            return [
                '- Fix CSS syntax (semicolons, brackets)',
                '- Verify property names are valid',
                '- Check for unclosed rules',
            ];
        default:
            return [
                '- Check for undefined values',
                '- Verify imports are correct',
                '- Ensure proper error handling',
            ];
    }
}
