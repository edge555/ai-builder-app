/**
 * Shared Supabase client factory for edge functions
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export function createServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url) {
    throw new Error('SUPABASE_URL is not configured');
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false }
  });
}

/**
 * Creates a user-scoped Supabase client using the caller's JWT.
 * RLS policies apply automatically based on auth.uid().
 */
export function createAuthClient(authHeader: string) {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!url) {
    throw new Error('SUPABASE_URL is not configured');
  }
  if (!anonKey) {
    throw new Error('SUPABASE_ANON_KEY is not configured');
  }

  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}
