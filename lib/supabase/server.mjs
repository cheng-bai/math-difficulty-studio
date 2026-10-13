import { cookies } from 'next/headers';
import { createSupabaseClient } from './client.mjs';

export async function serverSupabase() {
  const store = await cookies();
  return createSupabaseClient({
    getAll: () => store.getAll(),
    setAll(values) {
      // Server Components cannot set cookies. proxy.js persists refreshed tokens.
      try { values.forEach(({ name, value, options }) => store.set(name, value, options)); }
      catch { /* The proxy has already refreshed the session. */ }
    },
  });
}
