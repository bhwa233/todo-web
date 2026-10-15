import { beforeEach, expect, it, vi } from 'vitest';
import { fetchPageMetadata } from '../task/linkTitleFetch';
import { parseSourceUrl, resolveGallerySource } from './sourceResolver';

vi.mock('../task/linkTitleFetch', async (original) => ({
  ...(await original<typeof import('../task/linkTitleFetch')>()),
  fetchPageMetadata: vi.fn(),
}));
beforeEach(() => vi.resetAllMocks());

it('recognizes account and topic identities without treating post IDs as accounts', () => {
  const cases = [
    [
      'https://weibo.com/u/5878659096?tabtype=album',
      'WEIBO_PERSONAL',
      '5878659096',
    ],
    [
      'https://weibo.com/p/1008087888946285EA3E4CE698097CD58A0CC6',
      'WEIBO_SUPER_TOPIC',
      '1008087888946285ea3e4ce698097cd58a0cc6',
    ],
    [
      'https://m.weibo.cn/p/index?containerid=1008087888946285ea3e4ce698097cd58a0cc6',
      'WEIBO_SUPER_TOPIC',
      '1008087888946285ea3e4ce698097cd58a0cc6',
    ],
    [
      'https://www.xiaohongshu.com/user/profile/619e0b66000000001000e923',
      'XIAOHONGSHU_PERSONAL',
      '619e0b66000000001000e923',
    ],
    [
      'https://www.xiaohongshu.com/page/topics/63504df51f6dc6ed95c6b1e5',
      'XIAOHONGSHU_SUPER_TOPIC',
      '63504df51f6dc6ed95c6b1e5',
    ],
    [
      'https://www.douyin.com/user/MS4wLjABAAAA_sample',
      'DOUYIN_PERSONAL',
      'MS4wLjABAAAA_sample',
    ],
    [
      'https://www.iesdouyin.com/share/user/123?sec_uid=MS4wLjABAAAA_sample',
      'DOUYIN_PERSONAL',
      'MS4wLjABAAAA_sample',
    ],
    [
      'https://www.douyin.com/challenge/123456789',
      'DOUYIN_SUPER_TOPIC',
      '123456789',
    ],
  ];
  for (const [url, type, platformId] of cases) {
    expect(parseSourceUrl(url), url).toEqual({ type, platformId });
  }
  for (const url of [
    'https://weibo.com/123/AbcDEF',
    'https://www.xiaohongshu.com/explore/619e0b66000000001000e923',
    'https://www.douyin.com/video/123456789',
  ]) {
    expect(parseSourceUrl(url), url).toBeNull();
  }
});

it('validates the link against explicit identity and refuses unrelated hosts', async () => {
  await expect(
    resolveGallerySource({
      url: 'https://weibo.com/u/123',
      platformId: '456',
      name: '测试',
    }),
  ).rejects.toMatchObject({ code: 'SOURCE_MISMATCH' });
  await expect(
    resolveGallerySource({
      url: 'https://weibo.com/u/123',
      type: 'DOUYIN_PERSONAL',
      name: '测试',
    }),
  ).rejects.toMatchObject({ code: 'SOURCE_MISMATCH' });
  for (const url of [
    'https://weibo.com.evil.test/u/123',
    'https://evil.test/u/123',
    'https://user:pass@weibo.com/u/123',
  ]) {
    expect(() => parseSourceUrl(url), url).toThrow();
  }
  expect(fetchPageMetadata).not.toHaveBeenCalled();
});

it('resolves a shared short link even when the destination has no readable title', async () => {
  vi.mocked(fetchPageMetadata).mockResolvedValue({
    url: 'https://weibo.com/u/123',
    title: null,
  });
  const source = await resolveGallerySource({
    url: '分享 https://t.cn/example ，快来看看',
    name: '指定名称',
  });
  expect(source).toMatchObject({
    type: 'WEIBO_PERSONAL',
    platformId: '123',
    name: '指定名称',
    missingFields: [],
  });
});

it('requires a supplied name when the platform is unavailable or returns a login page', async () => {
  vi.mocked(fetchPageMetadata).mockRejectedValueOnce(new Error('timeout'));
  const failed = await resolveGallerySource({
    type: 'WEIBO_PERSONAL',
    platformId: '123',
  });
  expect(failed).toMatchObject({
    platformId: '123',
    name: null,
    missingFields: ['name'],
  });
  vi.mocked(fetchPageMetadata).mockResolvedValueOnce({
    url: 'https://weibo.com/u/123',
    title: '登录 - 微博',
  });
  expect(
    (await resolveGallerySource({ url: 'https://weibo.com/u/123' })).name,
  ).toBeNull();
  vi.mocked(fetchPageMetadata).mockRejectedValueOnce(new Error('timeout'));
  await expect(
    resolveGallerySource({ url: 'https://t.cn/unavailable' }),
  ).rejects.toMatchObject({ code: 'UNRESOLVED_SOURCE_URL' });
});
