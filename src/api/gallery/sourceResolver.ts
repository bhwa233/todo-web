import { ProducerType } from '@prisma/client';
import { fetchPageMetadata, publicPageUrl } from '../task/linkTitleFetch';
import { GalleryConfigError } from './configErrors';

export interface SourceInput {
  type?: ProducerType;
  platformId?: string;
  url?: string;
  name?: string;
}

const hosts = new Set([
  'weibo.com',
  'www.weibo.com',
  'm.weibo.cn',
  'weibo.cn',
  'www.weibo.cn',
  'supertalk.weibo.com',
  't.cn',
  'xiaohongshu.com',
  'www.xiaohongshu.com',
  'xhslink.com',
  'www.xhslink.com',
  'douyin.com',
  'www.douyin.com',
  'v.douyin.com',
  'www.iesdouyin.com',
  'iesdouyin.com',
]);

function sourceUrl(input: string) {
  let url: URL;
  try {
    url = publicPageUrl(input);
  } catch {
    throw new GalleryConfigError(
      'INVALID_SOURCE_URL',
      '请提供有效的公开平台链接。',
    );
  }
  if (!hosts.has(url.hostname) || (url.port && url.port !== '443')) {
    throw new GalleryConfigError(
      'UNSUPPORTED_SOURCE_URL',
      '仅支持微博、小红书、抖音及其官方短链接。',
    );
  }
  // Upgrade shared HTTP links before any network request.
  url.protocol = 'https:';
  return url;
}

export function normalizePlatformId(type: ProducerType, input: string) {
  const id = input.trim();
  const valid =
    type === 'WEIBO_PERSONAL'
      ? /^\d{1,30}$/.test(id)
      : type === 'WEIBO_SUPER_TOPIC'
        ? /^100808[a-f\d]{32}$/i.test(id)
        : type.startsWith('XIAOHONGSHU_')
          ? /^[a-f\d]{24}$/i.test(id)
          : type === 'DOUYIN_SUPER_TOPIC'
            ? /^\d{1,30}$/.test(id)
            : /^[A-Za-z\d_-]{1,200}$/.test(id);
  if (!valid) {
    throw new GalleryConfigError(
      'INVALID_PLATFORM_ID',
      '平台 ID 格式不正确；请使用主页或话题链接中的 ID。',
      { type },
    );
  }
  return type.startsWith('XIAOHONGSHU_') || type === 'WEIBO_SUPER_TOPIC'
    ? id.toLowerCase()
    : id;
}

export function canonicalSourceUrl(type: ProducerType, platformId: string) {
  const id = encodeURIComponent(platformId);
  switch (type) {
    case 'WEIBO_PERSONAL':
      return `https://weibo.com/u/${id}`;
    case 'WEIBO_SUPER_TOPIC':
      return `https://weibo.com/p/${id}`;
    case 'XIAOHONGSHU_PERSONAL':
      return `https://www.xiaohongshu.com/user/profile/${id}`;
    case 'XIAOHONGSHU_SUPER_TOPIC':
      return `https://www.xiaohongshu.com/page/topics/${id}`;
    case 'DOUYIN_PERSONAL':
      return `https://www.douyin.com/user/${id}`;
    case 'DOUYIN_SUPER_TOPIC':
      return `https://www.douyin.com/challenge/${id}`;
  }
}

// Platform identity is application-specific. Reuse URL and safe HTTP primitives;
// general metadata libraries do not distinguish a post ID from an account ID.
export function parseSourceUrl(
  input: string,
): { type: ProducerType; platformId: string } | null {
  const url = sourceUrl(input);
  const path = url.pathname.replace(/\/+$/, '');
  let type: ProducerType | undefined;
  let id: string | undefined;
  if (
    [
      'weibo.com',
      'www.weibo.com',
      'weibo.cn',
      'www.weibo.cn',
      'm.weibo.cn',
      'supertalk.weibo.com',
    ].includes(url.hostname)
  ) {
    const topic =
      /^\/p\/(100808[a-f\d]{32})(?:\/.*)?$/i.exec(path) ??
      /^\/t\/(100808[a-f\d]{32})$/i.exec(path);
    const container = url.searchParams.get('containerid');
    const user =
      /^\/(?:u|profile)\/(\d+)$/.exec(path) ?? /^\/(\d+)$/.exec(path);
    if (topic || (path === '/p/index' && container?.startsWith('100808'))) {
      type = 'WEIBO_SUPER_TOPIC';
      id = topic?.[1] ?? container!;
    } else if (user) {
      type = 'WEIBO_PERSONAL';
      id = user[1];
    }
  } else if (
    ['xiaohongshu.com', 'www.xiaohongshu.com'].includes(url.hostname)
  ) {
    const user = /^\/user\/profile\/([a-f\d]{24})$/i.exec(path);
    const topic = /^\/page\/topics\/([a-f\d]{24})$/i.exec(path);
    if (user || topic) {
      type = user ? 'XIAOHONGSHU_PERSONAL' : 'XIAOHONGSHU_SUPER_TOPIC';
      id = (user ?? topic)![1];
    }
  } else if (
    [
      'douyin.com',
      'www.douyin.com',
      'www.iesdouyin.com',
      'iesdouyin.com',
    ].includes(url.hostname)
  ) {
    const user = /^\/user\/([A-Za-z\d_-]+)$/.exec(path);
    const sharedUser = /^\/share\/user\/\d+$/.test(path)
      ? url.searchParams.get('sec_uid')
      : null;
    const topic = /^\/(?:challenge|topic)\/(\d+)$/.exec(path);
    if (user || sharedUser || topic) {
      type = topic ? 'DOUYIN_SUPER_TOPIC' : 'DOUYIN_PERSONAL';
      id = topic?.[1] ?? user?.[1] ?? sharedUser!;
    }
  }
  return type && id
    ? { type, platformId: normalizePlatformId(type, id) }
    : null;
}

export async function resolveGallerySource(
  input: SourceInput,
  options: { fetchName?: boolean } = {},
) {
  const warnings: string[] = [];
  let parsed: ReturnType<typeof parseSourceUrl> = null;
  let metadata: Awaited<ReturnType<typeof fetchPageMetadata>> = null;
  let pageUrl: string | undefined;
  if (input.url) {
    const links = input.url.match(/https?:\/\/[^\s<>"“”，。；、（）]+/gi) ?? [];
    if (links.length !== 1) {
      throw new GalleryConfigError(
        'INVALID_SOURCE_URL',
        '请提供一个主页、话题链接，或包含单个链接的分享文本。',
      );
    }
    pageUrl = sourceUrl(links[0].replace(/[，。；、）)！!]+$/, '')).href;
    parsed = parseSourceUrl(pageUrl);
  }
  // Resolve redirects only when needed, and fetch a display name when omitted.
  if (pageUrl && (!parsed || (!input.name && options.fetchName !== false))) {
    try {
      metadata = await fetchPageMetadata(pageUrl, (url) => {
        url.href = sourceUrl(url.href).href;
      });
    } catch (error) {
      if (error instanceof GalleryConfigError) throw error;
      warnings.push('无法获取页面信息；可显式提供平台类型、ID 和名称。');
    }
    if (!parsed && metadata) parsed = parseSourceUrl(metadata.url);
  }
  if (input.url && !parsed) {
    throw new GalleryConfigError(
      'UNRESOLVED_SOURCE_URL',
      '无法从链接识别来源；请提供个人主页或话题链接，或改用平台类型和 ID。',
    );
  }
  if (parsed && input.type && parsed.type !== input.type) {
    throw new GalleryConfigError(
      'SOURCE_MISMATCH',
      '链接与提供的平台类型不一致。',
    );
  }
  const type = parsed?.type ?? input.type;
  if (!type || (!parsed && !input.platformId)) {
    throw new GalleryConfigError(
      'SOURCE_REQUIRED',
      '请提供链接，或同时提供平台类型和平台 ID。',
    );
  }
  const platformId = normalizePlatformId(
    type,
    input.platformId ?? parsed!.platformId,
  );
  if (parsed && platformId !== parsed.platformId) {
    throw new GalleryConfigError(
      'SOURCE_MISMATCH',
      '链接与提供的平台 ID 不一致。',
    );
  }
  if (!pageUrl && !input.name && options.fetchName !== false) {
    try {
      metadata = await fetchPageMetadata(
        canonicalSourceUrl(type, platformId),
        (url) => {
          url.href = sourceUrl(url.href).href;
        },
      );
    } catch {
      warnings.push('无法自动获取名称，请提供名称。');
    }
  }
  const title = metadata?.title
    ?.replace(
      /(?:的微博|的个人空间)?\s*[-_—|]\s*(?:微博|新浪微博超话社区|小红书|抖音).*$/,
      '',
    )
    .trim();
  const name =
    input.name?.trim() ||
    (title &&
    !/登录|验证|访问限制|访问受限|页面不存在|安全检查|机器人|captcha|access denied/i.test(
      title,
    ) &&
    !['微博', '小红书', '抖音', 'Sina Visitor System'].includes(title)
      ? title
      : null);
  return {
    type,
    platformId,
    name,
    canonicalUrl: canonicalSourceUrl(type, platformId),
    warnings,
    missingFields: name ? [] : ['name'],
  };
}
