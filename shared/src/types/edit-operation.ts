/**
 * Edit Operation Types
 *
 * Types for diff-based LLM output to enable surgical code modifications
 * instead of returning full file content.
 */

/**
 * Represents a single edit operation within a file.
 * Uses search/replace pattern for surgical edits.
 */
export interface EditOperation {
    /** The exact content to search for (must match exactly including whitespace) */
    search: string;
    /** The content to replace with */
    replace: string;
    /** Optional: which occurrence to replace if search matches multiple times (1-indexed) */
    occurrence?: number;
}

/**
 * Represents modifications to a single file.
 */
export interface FileEdit {
    /** Path to the file relative to project root */
    path: string;
    /** Operation type: modify existing, create new, replace entire file, or delete */
    operation: 'modify' | 'create' | 'replace_file' | 'delete';
    /** For 'create': the full file content */
    content?: string;
    /** For 'modify': array of surgical edits to apply in order */
    edits?: EditOperation[];
}

/**
 * Structured output from LLM for modifications.
 * This is the expected JSON structure from Gemini.
 */
export interface ModificationOutput {
    /** Array of file modifications */
    files: FileEdit[];
}

/**
 * Result of applying edits to a file.
 */
export interface EditApplicationResult {
    /** Whether the edits were successfully applied */
    success: boolean;
    /** The modified content if successful */
    content?: string;
    /** Error message if failed */
    error?: string;
    /** Which edit failed (0-indexed) */
    failedEditIndex?: number;
    /** Warning messages from edit application (e.g., fuzzy matching) */
    warnings?: string[];
}
