import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

// NOTE: In some preview environments, Vite env injection can be flaky.
// We keep a safe fallback to avoid a hard crash (blank screen).
// These values are publishable (anon) and are safe to ship in the frontend.
const FALLBACK_URL = 'https://hzppirupmuvctfnqubvq.supabase.co';
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6cHBpcnVwbXV2Y3RmbnF1YnZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxOTcwNzcsImV4cCI6MjA4NTc3MzA3N30.YvqZIYqyHyLh2e_FrX-jOZEjQ2ki-k0uUVorVNMm8P8';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL;
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || FALLBACK_ANON_KEY;

export const FUNCTIONS_BASE_URL = `${SUPABASE_URL}/functions/v1`;

export const backend = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
