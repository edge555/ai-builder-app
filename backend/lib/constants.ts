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

// Timeouts (in milliseconds)
export const API_REQUEST_TIMEOUT = 300000; // 5 minutes
export const OPENROUTER_TIMEOUT = 300000; // 5 minutes

// Token budget for AI context
export const TOKEN_BUDGET = 4000;
export const CHARS_PER_TOKEN = 4;

// Max output tokens per operation type (OpenRouter)
export const MAX_OUTPUT_TOKENS_GENERATION = 16384;
export const MAX_OUTPUT_TOKENS_MODIFICATION = 8192;
export const MAX_OUTPUT_TOKENS_PLANNING = 1024;

// Max output tokens per operation type (Modal / Qwen 2.5-Coder-7B-Instruct)
// Billed per GPU hour — not per token — so larger limits cost only wall-clock time.
// Qwen 2.5-Coder-7B-Instruct has a 32 K context window; typical input is 3–8 K tokens.
export const MODAL_MAX_OUTPUT_TOKENS_GENERATION = 32768;
export const MODAL_MAX_OUTPUT_TOKENS_MODIFICATION = 16384;
export const MODAL_MAX_OUTPUT_TOKENS_PLANNING = 2048;
