import { scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';

const derive = promisify(scrypt);
export const COOKIE_NAME = 'math_studio_session';
export const SESSION_SECONDS = 60 * 60 * 8;

export function configuredUsers() {
  try {
    const users = JSON.parse(process.env.AUTH_USERS_JSON || '[]');
    return Array.isArray(users) ? users.filter(u => typeof u.username === 'string' && typeof u.name === 'string' && /^[a-f0-9]{32,}$/.test(u.salt) && /^[a-f0-9]{128}$/.test(u.hash)) : [];
  } catch { return []; }
}
function key() {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) throw new Error('Authentication is not configured');
  return new TextEncoder().encode(process.env.AUTH_SECRET);
}
export function authReady() { return Boolean(process.env.AUTH_SECRET?.length >= 32 && configuredUsers().length); }
function version(user) { return createHash('sha256').update(user.salt + user.hash).digest('hex'); }

export async function checkPassword(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string' || username.length > 80 || password.length > 256) return null;
  const user = configuredUsers().find(u => u.username === username.trim().toLowerCase());
  // Derive even for unknown users so the response does not reveal account existence.
  const hash = await derive(password, user?.salt || '0'.repeat(32), 64);
  const expected = Buffer.from(user?.hash || '0'.repeat(128), 'hex');
  return timingSafeEqual(hash, expected) && user ? user : null;
}
export async function issueSession(user) {
  return new SignJWT({ version: version(user) }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.username)
    .setIssuer('math-difficulty-studio').setAudience('math-difficulty-studio').setIssuedAt().setExpirationTime(`${SESSION_SECONDS}s`).sign(key());
}
export async function verifySession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'], issuer: 'math-difficulty-studio', audience: 'math-difficulty-studio', maxTokenAge: `${SESSION_SECONDS}s` });
    const user = configuredUsers().find(u => u.username === payload.sub);
    return user && payload.version === version(user) ? { username: user.username, name: user.name } : null;
  } catch { return null; }
}
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  try {
    // Next.js can normalize the internal URL hostname to localhost. Host is the
    // browser-facing authority; still require the request's actual scheme.
    if (!origin || !host) return false;
    const expected = new URL(request.url);
    expected.host = host;
    return new URL(origin).origin === expected.origin;
  }
  catch { return false; }
}
