import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
export const tokenHash = value => createHash('sha256').update(value).digest('hex');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const actual = await derive(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

export function createSession(db, userId, response, secure) {
  const token = randomBytes(32).toString('hex');
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run(tokenHash(token), userId, Date.now() + maxAge);
  response.cookie('financia_session', token, { httpOnly: true, sameSite: 'strict', secure, maxAge, path: '/' });
}

export function sessionToken(request) {
  const cookies = request.headers.cookie?.split(';').map(c => c.trim()) ?? [];
  return cookies.find(c => c.startsWith('financia_session='))?.slice('financia_session='.length);
}
