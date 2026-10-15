// An explicit switch keeps the deployed invited accounts working until migration.
export function authProvider() {
  return process.env.AUTH_PROVIDER || 'legacy';
}

export function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key?.startsWith('sb_publishable_')) return null;
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') return null;
    return { url: parsed.origin, key };
  } catch { return null; }
}

export function safeReturnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return '/';
  try {
    const url = new URL(value, 'https://studio.invalid');
    // Only private application routes are valid post-login destinations.
    if (url.origin !== 'https://studio.invalid' || !/^\/(?:$|reader(?:\/|$)|library(?:\/|$)|bookshelf(?:\/|$)|national(?:\/|$)|midterms(?:\/|$)|search$|modules$|workbench(?:\/|$))/.test(url.pathname)) return '/';
    return url.pathname + url.search + url.hash;
  } catch { return '/'; }
}
