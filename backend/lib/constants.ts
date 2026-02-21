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
export const GEMINI_TIMEOUT = 300000; // 5 minutes

// Valid file extensions
export const VALID_CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
export const VALID_STYLE_EXTENSIONS = ['.css', '.scss'];

// Token budget for AI context
export const TOKEN_BUDGET = 4000;
export const CHARS_PER_TOKEN = 4;

// Max output tokens per operation type (Gemini)
export const MAX_OUTPUT_TOKENS_GENERATION = 16384;
export const MAX_OUTPUT_TOKENS_MODIFICATION = 8192;
export const MAX_OUTPUT_TOKENS_PLANNING = 1024;

// Max output tokens per operation type (Modal / Qwen 2.5-Coder-7B-Instruct)
// Billed per GPU hour — not per token — so larger limits cost only wall-clock time.
// Qwen 2.5-Coder-7B-Instruct has a 32 K context window; typical input is 3–8 K tokens.
export const MODAL_MAX_OUTPUT_TOKENS_GENERATION = 32768;
export const MODAL_MAX_OUTPUT_TOKENS_MODIFICATION = 16384;
export const MODAL_MAX_OUTPUT_TOKENS_PLANNING = 2048;
