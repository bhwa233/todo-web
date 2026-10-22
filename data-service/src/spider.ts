import { Platform, ProducerType, UploadStatus } from '@prisma/client';
import { z } from 'zod';
import { DataServiceError } from '../../src/data/protocol';
import { atomic, guard, insert, update } from './atomic';
import { dateValue, nextVersion, type Database } from './db';

export const spiderReads = new Set([
  'producers',
  'producer',
  'uploadedMedia',
  'pendingCount',
  'remainingUploadCount',
  'uploadMedia',
]);
const idSchema = z.object({ id: z.string().min(1).max(200) });
const dimensions = z
  .number()
  .int()
  .positive()
  .max(2147483647)
  .nullable()
  .optional();
const mediaSchema = z
  .object({
    postId: z.string().min(1),
    producerId: z.string().min(1),
    userId: z.string().nullable(),
    originMediaUrl: z.string().min(1),
    galleryMediaUrl: z.url().refine((value) => /^https?:\/\//i.test(value)),
    thumbnailUrl: z.string().nullable().optional(),
    originSrc: z.string().nullable().optional(),
    width: dimensions,
    height: dimensions,
    createTime: z.date().nullable().optional(),
  })
  .strict();

export async function spiderCommand(
  db: D1Database,
  prisma: Database,
  operation: string,
  input: unknown,
) {
  if (operation === 'producers') {
    const { type } = z.object({ type: z.enum(ProducerType) }).parse(input);
    return prisma.producer.findMany({
      where: { deletedAt: null, type, producerId: { not: null } },
      orderBy: { createTime: 'desc' },
    });
  }
  if (operation === 'producer')
    return prisma.producer.findUnique({ where: idSchema.parse(input) });
  if (operation === 'producerWatermark') {
    const { id } = idSchema.parse(input);
    return prisma.producer.update({
      where: { id },
      data: { lastPostTime: new Date() },
    });
  }
  if (operation === 'upsertPost') {
    const data = z
      .object({
        platform: z.enum(Platform),
        platformId: z.union([z.string(), z.number()]).transform(String),
        userId: z.string(),
        producerId: z.string(),
        createTime: z.date(),
      })
      .parse(input);
    const now = dateValue(nextVersion());
    await db
      .prepare(
        `INSERT INTO Post (id,platform,platformId,userId,producerId,createTime,updateTime,status) VALUES (?,?,?,?,?,?,?,'PENDING') ON CONFLICT(platform,platformId) DO UPDATE SET userId=excluded.userId, producerId=excluded.producerId, createTime=excluded.createTime, updateTime=excluded.updateTime WHERE Post.status <> 'PROCESSING' AND (Post.userId<>excluded.userId OR Post.producerId<>excluded.producerId OR Post.createTime<>excluded.createTime)`,
      )
      .bind(
        crypto.randomUUID(),
        data.platform,
        data.platformId,
        data.userId,
        data.producerId,
        dateValue(data.createTime),
        now,
      )
      .run();
    return prisma.post.findUniqueOrThrow({
      where: {
        platform_platformId: {
          platform: data.platform,
          platformId: data.platformId,
        },
      },
    });
  }
  if (operation === 'claimPost') {
    const { runStartedAt } = z.object({ runStartedAt: z.date() }).parse(input);
    const claimed = await db
      .prepare(
        `UPDATE Post SET status='PROCESSING', updateTime=? WHERE id=(SELECT id FROM Post WHERE platform='WEIBO' AND deletedAt IS NULL AND (status='PENDING' OR (status='FAILED' AND updateTime<?)) ORDER BY updateTime ASC,id ASC LIMIT 1) RETURNING id`,
      )
      .bind(dateValue(nextVersion()), dateValue(runStartedAt))
      .first<{ id: string }>();
    return claimed
      ? prisma.post.findUniqueOrThrow({ where: { id: claimed.id } })
      : null;
  }
  if (operation === 'postStatus') {
    const { id, status } = idSchema
      .extend({ status: z.enum(UploadStatus) })
      .parse(input);
    return prisma.post.update({ where: { id }, data: { status } });
  }
  if (operation === 'recoverPosts') {
    const { staleBefore } = z.object({ staleBefore: z.date() }).parse(input);
    const result = await prisma.post.updateMany({
      where: {
        platform: Platform.WEIBO,
        deletedAt: null,
        status: UploadStatus.PROCESSING,
        updateTime: { lt: staleBefore },
      },
      data: { status: UploadStatus.PENDING },
    });
    return result.count;
  }
  if (operation === 'pendingCount')
    return prisma.post.count({ where: { status: UploadStatus.PENDING } });
  if (operation === 'uploadedMedia') {
    const { postId } = z.object({ postId: z.string().min(1) }).parse(input);
    return prisma.media.findMany({
      where: {
        postId,
        deletedAt: null,
        status: UploadStatus.UPLOADED,
        galleryMediaUrl: { not: null },
      },
      select: { originMediaUrl: true, galleryMediaUrl: true },
    });
  }
  if (operation === 'saveMedia') {
    const rows = z.array(mediaSchema).max(100).parse(input);
    for (const media of rows) {
      await atomic(db, async () => {
        const existing = await prisma.media.findFirst({
          where: {
            postId: media.postId,
            originMediaUrl: media.originMediaUrl,
            deletedAt: null,
          },
        });
        const record = {
          ...media,
          status: UploadStatus.UPLOADED,
          updateTime: nextVersion(existing?.updateTime),
        };
        const statements = existing
          ? !existing.galleryMediaUrl ||
            existing.status !== UploadStatus.UPLOADED
            ? [
                guard(
                  db,
                  'EXISTS (SELECT 1 FROM Media WHERE id=? AND updateTime=?)',
                  existing.id,
                  dateValue(existing.updateTime),
                ),
                update(db, 'Media', existing.id, record),
              ]
            : []
          : [
              guard(
                db,
                'NOT EXISTS (SELECT 1 FROM Media WHERE postId=? AND originMediaUrl=? AND deletedAt IS NULL)',
                media.postId,
                media.originMediaUrl,
              ),
              insert(db, 'Media', record),
            ];
        return { statements, result: async () => null };
      });
    }
    return rows.length;
  }
  if (operation === 'mediaGalleryUrl') {
    const data = z
      .object({
        id: z.number().int(),
        galleryMediaUrl: z.url(),
        status: z.enum(UploadStatus),
      })
      .parse(input);
    await prisma.media.update({
      where: { id: data.id },
      data: { galleryMediaUrl: data.galleryMediaUrl, status: data.status },
    });
    return true;
  }
  if (operation === 'remainingUploadCount')
    return prisma.media.count({
      where: { galleryMediaUrl: null, originMediaUrl: { not: null } },
    });
  if (operation === 'uploadMedia') {
    const { limit } = z
      .object({ limit: z.number().int().min(1).max(1000).default(100) })
      .parse(input);
    return prisma.media.findMany({
      where: { galleryMediaUrl: null, status: UploadStatus.PENDING },
      take: limit,
      orderBy: { createTime: 'desc' },
    });
  }
  throw new DataServiceError('NOT_FOUND', '未知爬虫操作。');
}
