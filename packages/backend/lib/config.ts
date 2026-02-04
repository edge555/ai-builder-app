import {
  DIFF_CONTEXT_LINES,
  MAX_COMPONENT_LINES,
  MAX_APP_LINES,
  API_REQUEST_TIMEOUT,
  GEMINI_TIMEOUT,
} from './constants';

export interface BackendConfig {
  cors: {
    origin: string;
    methods: string[];
    headers: string[];
  };
  api: {
    timeout: number;
    maxRetries: number;
    retryBaseDelay: number;
  };
  ai: {
    maxOutputTokens: number;
    temperature: number;
    model: string;
    easyModel: string;
    hardModel: string;
  };
  validation: {
    maxComponentLines: number;
    maxAppLines: number;
    contextLines: number;
  };
}

export const config: BackendConfig = {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    headers: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'X-Requested-With',
      'Accept',
      'Accept-Version',
      'Content-Length',
      'Content-MD5',
      'Date',
      'X-Api-Version',
    ],
  },
  api: {
    timeout: API_REQUEST_TIMEOUT,
    maxRetries: 3,
    retryBaseDelay: 1000,
  },
  ai: {
    maxOutputTokens: Number(process.env.MAX_OUTPUT_TOKENS) || 16384,
    temperature: 0.7,
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    easyModel: process.env.GEMINI_EASY_MODEL || 'gemini-2.5-flash-lite',
    hardModel: process.env.GEMINI_HARD_MODEL || 'gemini-2.5-flash',
  },
  validation: {
    maxComponentLines: MAX_COMPONENT_LINES,
    maxAppLines: MAX_APP_LINES,
    contextLines: DIFF_CONTEXT_LINES,
  },
};

// Re-export constants for convenience
export {
  DIFF_CONTEXT_LINES,
  MAX_PRIMARY_SLICES,
  MAX_CONTEXT_SLICES,
  MAX_COMPONENT_LINES,
  MAX_APP_LINES,
  API_REQUEST_TIMEOUT,
  GEMINI_TIMEOUT,
  VALID_CODE_EXTENSIONS,
  VALID_STYLE_EXTENSIONS,
} from './constants';
