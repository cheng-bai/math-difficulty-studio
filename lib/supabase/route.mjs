import { createSupabaseClient, SUPABASE_COOKIE_NAME } from './client.mjs';

export function routeSupabase(request) {
  const pendingCookies = [];
  const pendingHeaders = new Headers();
  const client = createSupabaseClient({
    getAll: () => request.cookies.getAll(),
    setAll(values, headers) {
      for (const cookie of values) {
        request.cookies.set(cookie.name, cookie.value);
        pendingCookies.push(cookie);
      }
      for (const [name, value] of Object.entries(headers || {})) pendingHeaders.set(name, value);
    },
  });
  return {
    client,
    clearSession(response) {
      // Also clear tokens if the Auth service could not complete signOut.
      const names = new Set([SUPABASE_COOKIE_NAME, ...request.cookies.getAll().map(c => c.name), ...pendingCookies.map(c => c.name)]);
      for (const name of names) {
        if (name === SUPABASE_COOKIE_NAME || name.startsWith(SUPABASE_COOKIE_NAME + '.')) {
          response.cookies.set(name, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
        }
      }
      return response;
    },
    apply(response) {
      for (const { name, value, options } of pendingCookies) response.cookies.set(name, value, options);
      for (const [name, value] of pendingHeaders) response.headers.set(name, value);
      response.headers.set('Cache-Control', 'private, no-store, max-age=0');
      response.headers.set('Vercel-CDN-Cache-Control', 'no-store');
      return response;
    },
  };
}
