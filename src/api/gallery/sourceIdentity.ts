import { ProducerType } from '@prisma/client';
import { GalleryConfigError } from './configErrors';

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
