import { authProvider, supabaseConfig } from './auth-config.mjs';
import { authReady as legacyReady } from './security.mjs';

export function authReady() {
  const provider = authProvider();
  return provider === 'supabase' ? Boolean(supabaseConfig()) : provider === 'legacy' && legacyReady();
}
