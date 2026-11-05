import { expect, it } from 'vitest';
import { downloaderAdminUrl } from './downloader-admin';

it('preserves old and new filter links while dropping credentials and external redirect targets', () => {
  const url = new URL(downloaderAdminUrl(new URLSearchParams([
    ['url', 'short-link%_'], ['requestDomain', 'x.com'], ['page', '2'], ['platform', 'x'],
    ['startDate', '2026-11-01'], ['endDate', '2026-11-05'], ['tab', 'parse'],
    ['token', 'private-session'], ['returnTo', 'https://example.invalid'],
  ])));
  expect(url.origin + url.pathname).toBe('https://admin.bhwa233.com/zh/admin/downloader');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    urlSearch: 'short-link%_', parsedHost: 'x.com', parsePage: '2', platform: 'x',
    startDate: '2026-11-01', endDate: '2026-11-05', tab: 'parse',
  });
  const preferred = new URL(downloaderAdminUrl(new URLSearchParams('url=old&urlSearch=current&type=bug&type=feature')));
  expect(preferred.searchParams.get('urlSearch')).toBe('current');
  expect(preferred.searchParams.getAll('type')).toEqual(['bug', 'feature']);
});
