import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { config } from '@/config';
import type { Database } from '@/integrations/supabase/types';
import { createLogger } from '@/utils/logger';

const backendClientLogger = createLogger('Backend');

// Environment variables from validated config
const SUPABASE_URL_ENV = config.supabase.url;
const SUPABASE_ANON_KEY_ENV = config.supabase.key;

// Fallback placeholder URL for when env vars are not set (prevents crash)
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTI4MjAsImV4cCI6MTk2MDc2ODgyMH0.placeholder';

const hasValidConfig = Boolean(SUPABASE_URL_ENV && SUPABASE_ANON_KEY_ENV);

if (!hasValidConfig) {
  backendClientLogger.warn(
    'Supabase environment variables not configured. ' +
    'Backend features will be unavailable. ' +
    'To enable, set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
  );
}

export const SUPABASE_URL = SUPABASE_URL_ENV || PLACEHOLDER_URL;
export const SUPABASE_ANON_KEY = SUPABASE_ANON_KEY_ENV || PLACEHOLDER_KEY;

// API base URL from validated config
const API_BASE_URL = config.api.baseUrl;

// If a local API URL is configured, use /api routes; otherwise fall back to Supabase Edge Functions
export const FUNCTIONS_BASE_URL = API_BASE_URL
  ? `${API_BASE_URL}/api`
  : `${SUPABASE_URL}/functions/v1`;

// Flag to check if backend is properly configured
export const isBackendConfigured = hasValidConfig;

export const backend: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
