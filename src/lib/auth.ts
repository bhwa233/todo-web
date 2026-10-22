import { forbidden } from 'next/navigation';
import { cookies } from 'next/headers';
import { sessionRole, SESSION_COOKIE } from './auth-session';

export async function currentRole() {
  return sessionRole((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requireAdmin() {
  if ((await currentRole()) !== 'admin') forbidden();
}
