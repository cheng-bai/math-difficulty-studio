// Local test double of the Auth HTTP API. Never deployed or linked to real users.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode('isolated-auth-fixture-key-not-for-production');
export const fixturePassword = 'fixture-password-only';
export async function startAuthFixture(port = 0) {
  const users = new Map();
  for (const name of ['invited', 'unauthorized', 'metadata', 'anonymous', 'chunked']) {
    const email = `${name}@example.test`;
    users.set(email, {
      id: randomUUID(), email, aud: 'authenticated', role: 'authenticated',
      created_at: new Date().toISOString(), email_confirmed_at: new Date().toISOString(),
      is_anonymous: name === 'anonymous',
      app_metadata: { provider: 'email', providers: ['email'], ...(['invited', 'chunked', 'anonymous'].includes(name) ? { studio_access: true } : {}) },
      user_metadata: { name: '测试教师', ...(name === 'metadata' ? { studio_access: true } : {}), ...(name === 'chunked' ? { note: 'x'.repeat(6000) } : {}) },
    });
  }
  const refreshTokens = new Map();
  let refreshCount = 0;
  let lookupUnavailable = false;
  let logoutUnavailable = false;
  async function session(email, expired = false) {
    const user = users.get(email);
    const exp = Math.floor(Date.now() / 1000) + (expired ? -3600 : 3600);
    const access_token = await new SignJWT({ email, role: 'authenticated', app_metadata: user.app_metadata })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt().setExpirationTime(exp).sign(secret);
    const refresh_token = randomUUID();
    refreshTokens.set(refresh_token, email);
    return { access_token, refresh_token, expires_in: expired ? -3600 : 3600, expires_at: exp, token_type: 'bearer', user };
  }
  const server = createServer(async (req, res) => {
    function send(status, body) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }
    try {
      const url = new URL(req.url, 'http://fixture.test');
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      if (url.pathname === '/auth/v1/token') {
        if (url.searchParams.get('grant_type') === 'refresh_token') {
          const email = refreshTokens.get(body.refresh_token);
          if (!email) return send(400, { code: 'refresh_token_not_found', msg: 'Invalid refresh token' });
          refreshTokens.delete(body.refresh_token); refreshCount++;
          return send(200, await session(email));
        }
        if (body.email === 'outage@example.test') return send(503, { msg: 'Fixture outage' });
        if (!users.has(body.email) || body.password !== fixturePassword) return send(400, { code: 'invalid_credentials', msg: 'Invalid login credentials' });
        return send(200, await session(body.email));
      }
      if (url.pathname === '/auth/v1/user') {
        if (lookupUnavailable) return send(503, { msg: 'Fixture lookup outage' });
        try {
          const { payload } = await jwtVerify((req.headers.authorization || '').replace(/^Bearer /, ''), secret);
          const user = users.get(payload.email);
          return user ? send(200, user) : send(401, { msg: 'Unknown user' });
        } catch { return send(401, { code: 'bad_jwt', msg: 'Invalid token' }); }
      }
      if (url.pathname === '/auth/v1/logout') {
        if (logoutUnavailable) return send(503, { msg: 'Fixture logout outage' });
        try {
          const { payload } = await jwtVerify((req.headers.authorization || '').replace(/^Bearer /, ''), secret);
          for (const [token, email] of refreshTokens) if (email === payload.email) refreshTokens.delete(token);
        } catch { /* Expired access tokens can still be removed locally. */ }
        res.writeHead(204); return res.end();
      }
      send(404, { msg: 'Unknown fixture endpoint' });
    } catch { send(500, { msg: 'Fixture error' }); }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    users, session,
    get refreshCount() { return refreshCount; },
    set lookupUnavailable(value) { lookupUnavailable = value; },
    set logoutUnavailable(value) { logoutUnavailable = value; },
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixture = await startAuthFixture(Number(process.env.AUTH_FIXTURE_PORT || 0));
  console.log(`Fixture ready: ${fixture.url}`);
}
