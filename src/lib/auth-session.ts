import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export type AuthRole = 'admin' | 'gallery' | 'none';
export const SESSION_COOKIE = 'todo_session';
export const SESSION_SECONDS = 30 * 24 * 60 * 60;

function signingKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32)
    throw new Error('Session signing is not configured');
  return new TextEncoder().encode(secret);
}

export function verifyAccessCode(password?: string): AuthRole {
  if (!password || password.length > 4096) return 'none';
  for (const [role, code] of [
    ['admin', process.env.EDIT_CODE],
    ['gallery', process.env.GALLERY_EDIT_CODE],
  ] as const) {
    if (
      code &&
      timingSafeEqual(
        createHash('sha256').update(password).digest(),
        createHash('sha256').update(code).digest(),
      )
    )
      return role;
  }
  return 'none';
}

function credentialVersion(role: Exclude<AuthRole, 'none'>) {
  const code =
    role === 'admin' ? process.env.EDIT_CODE : process.env.GALLERY_EDIT_CODE;
  if (!code) throw new Error('Role is not configured');
  return createHmac('sha256', signingKey())
    .update(`${role}\0${code}`)
    .digest('hex');
}

// JOSE validates the signature and claims. The credential version invalidates
// existing sessions when an access code changes.
export async function issueSession(role: Exclude<AuthRole, 'none'>) {
  return new SignJWT({ role, version: credentialVersion(role) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('todo-web')
    .setAudience('todo-web')
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(signingKey());
}

export async function sessionRole(token?: string): Promise<AuthRole> {
  if (!token || token.length > 4096) return 'none';
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ['HS256'],
      issuer: 'todo-web',
      audience: 'todo-web',
      maxTokenAge: `${SESSION_SECONDS}s`,
    });
    if (payload.role !== 'admin' && payload.role !== 'gallery') return 'none';
    if (payload.version !== credentialVersion(payload.role)) return 'none';
    return payload.role;
  } catch {
    return 'none';
  }
}
