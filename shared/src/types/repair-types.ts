/**
 * Repair System Types
 * 
 * Types for tracking repair attempts and failure history across retries.
 * Used by both backend (build-fix loops) and frontend (preview error repair).
 */

/**
 * A record of a single failed repair attempt.
 */
export interface RepairAttempt {
    /** Attempt number (1-indexed) */
    attempt: number;
    /** What went wrong in this attempt */
    error: string;
    /** What strategy or fix was tried (optional) */
    strategy?: string;
    /** When this attempt was made */
    timestamp: string;
}

/**
 * Full context passed to repair retries.
 * Accumulates failure history to help the AI avoid repeating mistakes.
 */
export interface RepairContext {
    /** The original user prompt/description */
    originalPrompt: string;
    /** History of all previous failed attempts */
    failureHistory: RepairAttempt[];
    /** Maximum number of attempts allowed */
    maxAttempts: number;
    /** Current attempt number (1-indexed) */
    currentAttempt: number;
}
