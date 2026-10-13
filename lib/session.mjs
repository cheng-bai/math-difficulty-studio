import { cookies, headers } from 'next/headers';
import { localRuntime, loopbackHost } from './local-runtime.mjs';
import { COOKIE_NAME, verifySession } from './security.mjs';
import { authProvider, supabaseConfig } from './auth-config.mjs';
import { serverSupabase } from './supabase/server.mjs';
import { verifiedStudioUser } from './supabase/auth.mjs';
export async function currentUser() {
  if (localRuntime()) {
    const requestHeaders = await headers();
    if (loopbackHost(requestHeaders.get('host') || '')) return { id: 'local-workspace', username: 'local', name: '本机工作空间' };
    return null;
  }
  const provider = authProvider();
  if (provider === 'legacy') return verifySession((await cookies()).get(COOKIE_NAME)?.value);
  if (provider !== 'supabase' || !supabaseConfig()) return null;
  return verifiedStudioUser(await serverSupabase());
}
