'use server';

import { cookies } from 'next/headers';
import { issueSession, verifyAccessCode, SESSION_COOKIE, SESSION_SECONDS } from '../lib/auth-session';

export async function validateEditCode(password?: string) {
  const role = verifyAccessCode(password);
  if (role !== 'none') {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, await issueSession(role), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_SECONDS,
      path: '/',
    });
    cookieStore.delete('auth_role');
    cookieStore.delete('auth_token');
  }
  return role;
}
