import { NextResponse } from 'next/server';
import { localRuntime } from './lib/local-runtime.mjs';
import { authProvider, supabaseConfig } from './lib/auth-config.mjs';
import { createSupabaseClient } from './lib/supabase/client.mjs';
import { verifiedStudioUser } from './lib/supabase/auth.mjs';

export async function proxy(request) {
  if (localRuntime()) return NextResponse.next();
  if (authProvider() !== 'supabase') return NextResponse.next();
  const pendingCookies = [];
  const pendingHeaders = new Headers();
  let user = null;
  if (supabaseConfig()) {
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
    user = await verifiedStudioUser(client);
  }
  const isPublic = ['/login', '/api/login', '/api/logout'].includes(request.nextUrl.pathname);
  let response;
  if (!isPublic && !user) {
    const url = new URL('/login', request.url);
    // Next requires an absolute redirect URL; retain the browser-facing host.
    url.host = request.headers.get('host') || url.host;
    url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
    response = NextResponse.redirect(url);
  } else {
    // Recreate only after updating request cookies, so downstream routes see refreshes.
    response = NextResponse.next({ request });
  }
  for (const { name, value, options } of pendingCookies) response.cookies.set(name, value, options);
  for (const [name, value] of pendingHeaders) response.headers.set(name, value);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Vercel-CDN-Cache-Control', 'no-store');
  return response;
}

export const config = {
  // Private fonts/images/JSON/MD must be checked too; do not exclude extensions.
  matcher: ['/', '/login', '/api/login', '/api/logout', '/reader/:path*', '/library/:path*', '/bookshelf/:path*', '/national/:path*', '/search', '/modules', '/workbench/:path*'],
};
