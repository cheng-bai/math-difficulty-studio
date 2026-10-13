// Explicit opt-in; a cloud deployment must never inherit the local access mode.
export function localRuntime(env = process.env) {
  return env.STUDIO_RUNTIME === 'local' && !env.VERCEL && !env.AWS_LAMBDA_FUNCTION_NAME;
}
export function loopbackHost(host) {
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(`http://${host}`).hostname); }
  catch { return false; }
}
export function localRequest(request, write = false) {
  if (!localRuntime() || !loopbackHost(request.headers.get('host') || '')) return false;
  const forwarded = request.headers.get('x-forwarded-host');
  if (forwarded && forwarded !== request.headers.get('host')) return false;
  if (!write) return true;
  try {
    const origin = new URL(request.headers.get('origin'));
    return origin.protocol === new URL(request.url).protocol && origin.host === request.headers.get('host');
  } catch { return false; }
}
