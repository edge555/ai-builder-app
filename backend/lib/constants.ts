/**
 * @module constants
 * @description Shared backend constants used across the application.
 * Centralizes magic numbers and threshold values to avoid duplication
 * and make tuning easier.
 *
 * Categories:
 * - API retry/timeout defaults
 * - Error logging limits
 * - Diff and slice selection limits
 * - Validation line-count limits
 * - Token budget for AI context
 * - Max output tokens per operation type and AI provider
 */

// API retry defaults
export const DEFAULT_API_MAX_RETRIES = 3;
export const DEFAULT_RETRY_BASE_DELAY_MS = 1000; // 1 second

// Error logging
export const ERROR_TEXT_MAX_LENGTH = 500;

// Diff computation constants
export const DIFF_CONTEXT_LINES = 3;

// Slice selection constants
export const MAX_PRIMARY_SLICES = 10;
export const MAX_CONTEXT_SLICES = 15;

// Validation limits
export const MAX_COMPONENT_LINES = 80;
export const MAX_APP_LINES = 100;
export const MAX_SINGLE_FILE_BYTES = 100 * 1024; // 100 KB per file
export const MAX_PROJECT_BYTES = 1024 * 1024;    // 1 MB total

// Timeouts (in milliseconds)
export const API_REQUEST_TIMEOUT = 300000; // 5 minutes
export const OPENROUTER_TIMEOUT = 300000; // 5 minutes

// Token budget for AI context
export const TOKEN_BUDGET = 4000;
export const CHARS_PER_TOKEN = 4;

// Max output tokens per operation type (OpenRouter)
export const MAX_OUTPUT_TOKENS_GENERATION = 32768;
export const MAX_OUTPUT_TOKENS_MODIFICATION = 8192;
export const MAX_OUTPUT_TOKENS_PLANNING = 1024;

// Max output tokens per operation type (Modal / Qwen 2.5-Coder-7B-Instruct)
// Billed per GPU hour — not per token — so larger limits cost only wall-clock time.
// Qwen 2.5-Coder-7B-Instruct has a 32 K context window; typical input is 3–8 K tokens.
export const MODAL_MAX_OUTPUT_TOKENS_GENERATION = 32768;
export const MODAL_MAX_OUTPUT_TOKENS_MODIFICATION = 16384;
export const MODAL_MAX_OUTPUT_TOKENS_PLANNING = 2048;

// Rate limiting
export const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute sliding window
export const RATE_LIMIT_CLEANUP_INTERVAL_MS = 60_000; // evict stale entries every 60s

// Per-tier max requests per IP per window
export const RATE_LIMIT_HIGH_COST_MAX = 5;    // generate-stream, modify-stream
export const RATE_LIMIT_MEDIUM_COST_MAX = 10; // generate, modify, plan
export const RATE_LIMIT_LOW_COST_MAX = 60;    // diff, revert, export, versions, health
export const RATE_LIMIT_CONFIG_MAX = 20;      // agent-config, provider-config

// Per-tier request body size limits
export const MAX_BODY_HIGH_COST_BYTES = 2 * 1024 * 1024;   // 2 MB
export const MAX_BODY_MEDIUM_COST_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_BODY_LOW_COST_BYTES = 5 * 1024 * 1024;    // 5 MB
export const MAX_BODY_CONFIG_BYTES = 64 * 1024;             // 64 KB
