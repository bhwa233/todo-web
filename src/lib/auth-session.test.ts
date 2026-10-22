import { afterEach, expect, it, vi } from 'vitest';
import { issueSession, sessionRole, verifyAccessCode } from './auth-session';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
function configured() {
  vi.stubEnv('SESSION_SECRET', 'test-signing-key-at-least-32-bytes-long');
  vi.stubEnv('EDIT_CODE', 'admin-example');
  vi.stubEnv('GALLERY_EDIT_CODE', 'gallery-example');
}
it('rejects unsigned roles, tampered signatures and changing a gallery role to admin', async () => {
  configured();
  const token = await issueSession('gallery');
  expect(await sessionRole(token)).toBe('gallery');
  for (const bad of [
    'admin',
    'auth_token',
    `${token}x`,
    `${token.split('.')[0]}.${Buffer.from(JSON.stringify({ role: 'admin' })).toString('base64url')}.${token.split('.')[2]}`,
  ])
    expect(await sessionRole(bad)).toBe('none');
});
it('expires sessions and invalidates them when their credential or signing key changes', async () => {
  configured();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01'));
  const token = await issueSession('admin');
  vi.setSystemTime(new Date('2026-03-01'));
  expect(await sessionRole(token)).toBe('none');
  vi.setSystemTime(new Date('2026-01-02'));
  vi.stubEnv('EDIT_CODE', 'rotated');
  expect(await sessionRole(token)).toBe('none');
  vi.stubEnv('EDIT_CODE', 'admin-example');
  vi.stubEnv('SESSION_SECRET', 'another-signing-key-at-least-32-bytes');
  expect(await sessionRole(token)).toBe('none');
});
it('does not grant any role when authentication configuration is absent', async () => {
  vi.stubEnv('EDIT_CODE', '');
  vi.stubEnv('GALLERY_EDIT_CODE', '');
  vi.stubEnv('SESSION_SECRET', '');
  expect(verifyAccessCode()).toBe('none');
  expect(verifyAccessCode('admin-example')).toBe('none');
  expect(await sessionRole('admin')).toBe('none');
});
