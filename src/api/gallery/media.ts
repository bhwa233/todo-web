'use server';
import { callDataService } from '../../data/client';
import type { Prisma } from '@prisma/client';

import { UploadStatus } from '@prisma/client';
import prisma from '../prisma';
import { MediaType } from './type';


// 定义支持的媒体类型扩展名
const VIDEO_EXTENSIONS = ['.mp4', '.mov'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];
const LIVEPHOTO_EXTENSIONS = ['.mov'];

// 构建媒体类型的 OR 条件
const getMediaTypeCondition = (type: MediaType | null) => {
  if (!type) return {};

  const extensions =
    type === 'video'
      ? VIDEO_EXTENSIONS
      : type === 'livephoto'
      ? LIVEPHOTO_EXTENSIONS
      : IMAGE_EXTENSIONS;
  return {
    OR: extensions.map((ext) => ({
      galleryMediaUrl: { endsWith: ext },
    })),
  };
};

// 构建基础的 where 子句
const getBaseWhereClause = (
  producerId: string | null,
  type: MediaType | null,
  tagIds: string[] | null = null,
) => ({
  deletedAt: null,
  status: UploadStatus.UPLOADED,
  ...(producerId ? { producerId } : {}),
  ...(tagIds && tagIds.length > 0 ? {
    producer: {
      ProducerToProducerTag: {
        some: {
          B: {
            in: tagIds
          }
        }
      }
    }
  } : {}),
  ...getMediaTypeCondition(type),
});

export async function getPicsCount(
  producerId: string | null,
  type: MediaType | null = null,
  tagIds: string[] | null = null,
) {
  try {
    const count = await prisma.media.count({
      where: getBaseWhereClause(producerId, type, tagIds),
    });
    return count;
  } catch (error) {
    console.error(
      'Failed to count media:',
      error instanceof Error ? error.message : error,
    );
    throw new Error('Failed to count media');
  }
}

export async function getPics(
  page: number,
  pageSize: number,
  producerId: string | null,
  sort: 'asc' | 'desc' | 'random' = 'desc',
  type: MediaType | null = null,
  tagIds: string[] | null = null,
  seed?: number, // Optional seed for deterministic random sort
  explicitSkip?: number, // Optional explicit skip count
) {
  try {
    // For random sort, we'll use a different approach to avoid ORDER BY RANDOM() performance issues
    if (sort === 'random') {
      return callDataService<Prisma.MediaGetPayload<{ include: { producer: true; post: true } }>[] >('gallery/mediaPage', {
        seed: seed ?? Math.floor(Math.random() * 1000000), skip: explicitSkip ?? (page - 1) * pageSize,
        limit: pageSize, producerId, type, tagIds,
      });
    }

    // Normal sorting
    return await prisma.media.findMany({
      where: getBaseWhereClause(producerId, type, tagIds),
      orderBy: { createTime: sort },
      take: pageSize,
      skip: explicitSkip ?? ((page - 1) * pageSize),
      include: {
        producer: true,
        post: true,
      },
    });
  } catch (error) {
    console.error(
      'Failed to get media:',
      error instanceof Error ? error.message : error,
    );
    throw new Error('Failed to get media');
  }
}
