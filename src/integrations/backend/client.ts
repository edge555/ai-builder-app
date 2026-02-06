import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

// Environment variables are required - fail with a clear message if missing
const SUPABASE_URL_ENV = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY_ENV = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL_ENV || !SUPABASE_ANON_KEY_ENV) {
  const missing = [];
  if (!SUPABASE_URL_ENV) missing.push('VITE_SUPABASE_URL');
  if (!SUPABASE_ANON_KEY_ENV) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');
  console.error(
    `[Supabase] Missing required environment variables: ${missing.join(', ')}. ` +
    'Please check your .env file.'
  );
}

export const SUPABASE_URL = SUPABASE_URL_ENV || '';
export const SUPABASE_ANON_KEY = SUPABASE_ANON_KEY_ENV || '';

export const FUNCTIONS_BASE_URL = `${SUPABASE_URL}/functions/v1`;

export const backend = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
