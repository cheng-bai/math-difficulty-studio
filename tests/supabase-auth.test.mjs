import test from 'node:test';
import assert from 'node:assert/strict';
import { studioUser, verifiedStudioUser } from '../lib/supabase/auth.mjs';
import { safeReturnPath, authProvider, supabaseConfig } from '../lib/auth-config.mjs';
import { authReady } from '../lib/auth.mjs';
import { sameOrigin } from '../lib/security.mjs';

const invited = { id: 'user-id', email: 'teacher@example.test', app_metadata: { studio_access: true }, user_metadata: { name: '教师' } };
test('only administrator-granted, non-anonymous users may read', () => {
  assert.equal(studioUser(invited).name, '教师');
  for (const user of [null, {}, { ...invited, app_metadata: {} }, { ...invited, app_metadata: { studio_access: 'true' } }, { ...invited, app_metadata: {}, user_metadata: { studio_access: true } }, { ...invited, is_anonymous: true }, { ...invited, banned_until: '2999-01-01T00:00:00Z' }]) assert.equal(studioUser(user), null);
});
test('identity lookup failure and revoked administrator access fail closed', async () => {
  assert.equal((await verifiedStudioUser({ auth: { getUser: async () => ({ data: { user: invited } }) } })).id, invited.id);
  for (const getUser of [async () => ({ error: new Error('invalid JWT') }), async () => { throw new Error('network'); }, async () => ({ data: { user: { ...invited, app_metadata: {} } } })]) assert.equal(await verifiedStudioUser({ auth: { getUser } }), null);
});
test('return destinations cannot escape the private application routes', () => {
  assert.equal(safeReturnPath('/library/index.html?year=2026#q1'), '/library/index.html?year=2026#q1');
  assert.equal(safeReturnPath('/bookshelf/数学专题书架.html'), '/bookshelf/%E6%95%B0%E5%AD%A6%E4%B8%93%E9%A2%98%E4%B9%A6%E6%9E%B6.html');
  assert.equal(safeReturnPath('/national/2024-I/试卷难度分析.html'), encodeURI('/national/2024-I/试卷难度分析.html'));
  assert.equal(safeReturnPath('/search?q=导数'), '/search?q=%E5%AF%BC%E6%95%B0');
  assert.equal(safeReturnPath('/modules'), '/modules');
  assert.equal(safeReturnPath('/workbench/results/example/index.html'), '/workbench/results/example/index.html');
  assert.equal(safeReturnPath('/workbench/../../api/logout'), '/');
  assert.equal(safeReturnPath('/workbenchish'), '/');
  assert.equal(safeReturnPath('/searchish'), '/');
  for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', '/login', '/api/logout', '/reader/../../api/logout', '/reader\n', '/readerish', null]) assert.equal(safeReturnPath(value), '/');
});
test('Supabase mode never falls back to legacy credentials and rejects privileged keys', () => {
  const before = { ...process.env };
  try {
    process.env.AUTH_PROVIDER = 'supabase';
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    assert.equal(authProvider(), 'supabase');
    assert.equal(authReady(), false);
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_secret_not_allowed';
    assert.equal(supabaseConfig(), null);
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fixture';
    assert.equal(authReady(), true);
    process.env.SUPABASE_URL = 'https://project.supabase.co/path';
    assert.equal(authReady(), false);
    process.env.AUTH_PROVIDER = 'typo';
    assert.equal(authReady(), false);
  } finally { process.env = before; }
});
test('state changes require the exact origin, including scheme', () => {
  assert.equal(sameOrigin(new Request('http://localhost:3000/api/login', { headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } })), true);
  assert.equal(sameOrigin(new Request('https://site.test/api/login', { headers: { host: 'site.test', origin: 'http://site.test' } })), false);
  assert.equal(sameOrigin(new Request('https://site.test/api/logout', { headers: { host: 'site.test', origin: 'https://site.test' } })), true);
});
