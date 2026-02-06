import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

// Environment variables - use fallbacks for development/preview
const SUPABASE_URL_ENV = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY_ENV = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Fallback placeholder URL for when env vars are not set (prevents crash)
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTI4MjAsImV4cCI6MTk2MDc2ODgyMH0.placeholder';

const hasValidConfig = Boolean(SUPABASE_URL_ENV && SUPABASE_ANON_KEY_ENV);

if (!hasValidConfig) {
  console.warn(
    '[Backend] Supabase environment variables not configured. ' +
    'Backend features will be unavailable. ' +
    'To enable, set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
  );
}

export const SUPABASE_URL = SUPABASE_URL_ENV || PLACEHOLDER_URL;
export const SUPABASE_ANON_KEY = SUPABASE_ANON_KEY_ENV || PLACEHOLDER_KEY;

export const FUNCTIONS_BASE_URL = `${SUPABASE_URL}/functions/v1`;

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
