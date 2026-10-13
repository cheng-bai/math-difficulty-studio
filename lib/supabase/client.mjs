import { createServerClient } from '@supabase/ssr';
import { supabaseConfig } from '../auth-config.mjs';
export const SUPABASE_COOKIE_NAME = 'math_studio_supabase';

export function createSupabaseClient(cookieAdapter) {
  const config = supabaseConfig();
  if (!config) throw new Error('Supabase Auth is not configured');
  return createServerClient(config.url, config.key, {
    // This app uses server-only password login; no browser SDK reads the tokens.
    cookieOptions: { name: SUPABASE_COOKIE_NAME, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' },
    cookies: cookieAdapter,
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
}
