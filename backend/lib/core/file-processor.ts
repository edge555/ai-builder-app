/**
 * File Processor Utility
 * Handles sanitization, normalization, and formatting of AI-generated files.
 */

import * as path from 'path';
import { WorkerPool } from './worker-pool';
import { createLogger } from '../logger';

const logger = createLogger('file-processor');

// Lazy initialization of worker pool
let workerPool: WorkerPool | null = null;

function getWorkerPool(): WorkerPool {
    if (!workerPool) {
        // In Next.js, __dirname can be unpredictable when bundled.
        // We use process.cwd() to resolve from the project root instead.
        const workerScript = path.resolve(process.cwd(), 'lib/workers/prettier-worker.js');
        workerPool = new WorkerPool(workerScript);
    }
    return workerPool;
}

export interface ProcessedFile {
    path: string;
    content: string;
    warning?: { message: string; type: 'formatting' };
}

export interface FileProcessorOptions {
    addFrontendPrefix?: boolean;
}

/**
 * Fix literal newlines inside string literals.
 * The AI sometimes generates code like: split('\n') where \n is a literal newline
 * This fixes it to: split('\\n')
 */
function fixLiteralNewlinesInStrings(content: string): string {
    // Only target specific safe patterns where a string contains JUST a newline
    // This repairs split('\n') -> quote, newline, quote
    // We avoid matching across lines by ensuring there's no other content
    const singleQuotePattern = /'\n'/g;
    const doubleQuotePattern = /"\n"/g;

    let fixed = content;

    // Fix single-quoted strings (convert to escaped)
    fixed = fixed.replace(singleQuotePattern, "'\\n'");

    // Fix double-quoted strings
    fixed = fixed.replace(doubleQuotePattern, '"\\n"');

    // Also handle CRLF
    fixed = fixed.replace(/'\r\n'/g, "'\\r\\n'");
    fixed = fixed.replace(/"\r\n"/g, '"\\r\\n"');

    return fixed;
}

/**
 * Process a single file: sanitize path, normalize newlines, format with Prettier
 */
export async function processFile(
    path: string,
    content: string,
    options: FileProcessorOptions = {}
): Promise<ProcessedFile> {
    // Sanitize path: remove accidental spaces
    let sanitizedPath = path.replace(/\s+/g, '');

    // Add frontend/ prefix if needed
    if (options.addFrontendPrefix && !sanitizedPath.startsWith('frontend/')) {
        sanitizedPath = `frontend/${sanitizedPath}`;
    }

    // STEP 1: Normalize global newlines (restore structural newlines)
    // AI often returns \n tokens that should be real newlines
    let normalizedContent = content;
    if (normalizedContent.includes('\\n')) {
        normalizedContent = normalizedContent.replace(/\\n/g, '\n');
    }
    if (normalizedContent.includes('\\t')) {
        normalizedContent = normalizedContent.replace(/\\t/g, '\t');
    }

    // STEP 2: Fix any newlines that ended up inside string literals
    // This handles cases where \n was meant to be an escape sequence inside a string
    normalizedContent = fixLiteralNewlinesInStrings(normalizedContent);

    // STEP 3: Handle double-escaped sequences from JSON
    if (normalizedContent.includes('\\\\n')) {
        normalizedContent = normalizedContent.replace(/\\\\n/g, '\\n');
    }
    if (normalizedContent.includes('\\\\t')) {
        normalizedContent = normalizedContent.replace(/\\\\t/g, '\\t');
    }

    // Format with Prettier (via Worker Pool)
    let formattingWarning: { message: string; type: 'formatting' } | undefined;
    try {
        const pool = getWorkerPool();
        const formatted = await pool.runTask({ content: normalizedContent, filePath: path });

        if (formatted !== normalizedContent) {
            logger.debug('File formatted successfully (worker)', { path });
            normalizedContent = formatted;
        }
    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Unknown error';
        logger.error('Failed to format file', {
            path,
            error: errorMsg
        });
        // On error, we keep normalizedContent as is (graceful degradation)
        formattingWarning = {
            message: `Failed to format with Prettier: ${errorMsg}. Using original content.`,
            type: 'formatting'
        };
    }

    return {
        path: sanitizedPath,
        content: normalizedContent,
        warning: formattingWarning
    };
}

export interface ProcessFilesResult {
    files: Record<string, string>;
    warnings: Array<{ path: string; message: string; type: 'formatting' }>;
}

/**
 * Process multiple files in parallel for better performance.
 * Returns both processed files and any warnings encountered.
 */
export async function processFiles(
    files: Array<{ path: string; content: string }>,
    options: FileProcessorOptions = {}
): Promise<ProcessFilesResult> {
    const validFiles = files.filter(f => f.path && f.content);

    const processed = await Promise.all(
        validFiles.map(file => processFile(file.path, file.content, options))
    );

    const result: Record<string, string> = {};
    const warnings: Array<{ path: string; message: string; type: 'formatting' }> = [];

    for (const { path, content, warning } of processed) {
        result[path] = content;
        if (warning) {
            warnings.push({ path, ...warning });
        }
    }

    return { files: result, warnings };
}
