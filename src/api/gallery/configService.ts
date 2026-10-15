import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import prisma from '../prisma';
import { GalleryConfigError } from './configErrors';
import {
  createSourceSchema,
  updateSourceSchema,
  listSourcesSchema,
  createTagSchema,
  updateTagSchema,
  listTagsSchema,
  changeSourceTagsSchema,
  sourceIdSchema,
} from './configSchemas';
import { normalizePlatformId, resolveGallerySource } from './sourceResolver';

const sourceInclude = {
  ProducerToProducerTag: {
    where: { ProducerTag: { deletedAt: null } },
    include: { ProducerTag: true },
  },
  _count: {
    select: {
      medias: { where: { deletedAt: null } },
      posts: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.ProducerInclude;

type SourceRow = Prisma.ProducerGetPayload<{ include: typeof sourceInclude }>;
function sourceView({
  ProducerToProducerTag: links,
  _count,
  ...source
}: SourceRow) {
  return {
    ...source,
    tags: links.map((link) => link.ProducerTag),
    mediaCount: _count.medias,
    postCount: _count.posts,
  };
}
export type GallerySource = ReturnType<typeof sourceView>;

// Serializable retries protect check-then-create and label read/modify/write,
// including requests from multiple Next.js instances, without a schema change.
async function write<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: 'Serializable',
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2034', 'P2002'].includes(error.code) &&
        attempt < 3
      )
        continue;
      throw error;
    }
  }
}

async function requireSource(
  tx: Prisma.TransactionClient,
  id: string,
  active = true,
) {
  const source = await tx.producer.findUnique({
    where: { id },
    include: sourceInclude,
  });
  if (!source || (active && source.deletedAt)) {
    throw new GalleryConfigError('SOURCE_NOT_FOUND', '来源不存在或已删除。', {
      id,
    });
  }
  return source;
}

async function validateTags(tx: Prisma.TransactionClient, ids: string[]) {
  const found = await tx.producerTag.count({
    where: { id: { in: ids }, deletedAt: null },
  });
  if (found !== ids.length)
    throw new GalleryConfigError('TAG_NOT_FOUND', '部分标签不存在或已删除。');
}

function checkVersion(source: { updateTime: Date }, expected?: string) {
  if (
    expected &&
    source.updateTime.toISOString() !== new Date(expected).toISOString()
  ) {
    throw new GalleryConfigError(
      'CONFLICT',
      '配置已被修改，请重新查询后再操作。',
    );
  }
}

async function rejectDuplicate(
  tx: Prisma.TransactionClient,
  type: GallerySource['type'],
  platformId: string,
  exceptId: string,
) {
  const existing = await tx.producer.findFirst({
    where: {
      type,
      producerId: platformId,
      deletedAt: null,
      id: { not: exceptId },
    },
  });
  if (existing)
    throw new GalleryConfigError('DUPLICATE_SOURCE', '该来源已经存在。', {
      existingId: existing.id,
    });
}

export async function listGallerySources(
  input: z.input<typeof listSourcesSchema> = {},
) {
  const query = listSourcesSchema.parse(input);
  const rows = await prisma.producer.findMany({
    where: {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.platformId ? { producerId: query.platformId } : {}),
      ...(query.untagged
        ? {
            ProducerToProducerTag: {
              none: { ProducerTag: { deletedAt: null } },
            },
          }
        : query.tagId
          ? {
              ProducerToProducerTag: {
                some: { B: query.tagId, ProducerTag: { deletedAt: null } },
              },
            }
          : {}),
      ...(query.search
        ? {
            OR: [
              {
                name: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                producerId: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                ProducerToProducerTag: {
                  some: {
                    ProducerTag: {
                      deletedAt: null,
                      name: {
                        contains: query.search,
                        mode: 'insensitive' as const,
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { id: 'asc' },
    take: query.limit + 1,
    include: sourceInclude,
  });
  return {
    items: rows.slice(0, query.limit).map(sourceView),
    nextCursor: rows.length > query.limit ? rows[query.limit - 1].id : null,
  };
}

// Preserve the web UI's unpaginated list and sort order.
export async function allGallerySources(order: 'asc' | 'desc' = 'desc') {
  return (
    await prisma.producer.findMany({
      where: { deletedAt: null },
      orderBy: { createTime: order },
      include: sourceInclude,
    })
  ).map(sourceView);
}

export async function getGallerySource(id: string) {
  sourceIdSchema.parse({ id });
  const row = await prisma.producer.findUnique({
    where: { id },
    include: sourceInclude,
  });
  if (!row)
    throw new GalleryConfigError('SOURCE_NOT_FOUND', '来源不存在。', { id });
  return sourceView(row);
}

export async function createGallerySource(
  input: z.input<typeof createSourceSchema>,
) {
  const data = createSourceSchema.parse(input);
  const resolved = await resolveGallerySource(data);
  return write(async (tx) => {
    const existing = await tx.producer.findFirst({
      where: { type: resolved.type, producerId: resolved.platformId },
      orderBy: [{ deletedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
      include: sourceInclude,
    });
    if (existing)
      return {
        outcome: existing.deletedAt
          ? ('deleted_exists' as const)
          : ('already_exists' as const),
        source: sourceView(existing),
        warnings: existing.deletedAt
          ? ['来源已删除；调用 gallery_restore_source 恢复。']
          : [
              '已存在；本次没有修改名称或标签。如需修改，请调用 gallery_update_source。',
            ],
      };
    if (!resolved.name)
      throw new GalleryConfigError(
        'NAME_REQUIRED',
        '无法自动获取来源名称，请显式提供 name。',
        { type: resolved.type, platformId: resolved.platformId },
      );
    await validateTags(tx, data.tagIds ?? []);
    const row = await tx.producer.create({
      data: {
        name: resolved.name,
        type: resolved.type,
        producerId: resolved.platformId,
        ProducerToProducerTag: {
          create: (data.tagIds ?? []).map((B) => ({ B })),
        },
      },
      include: sourceInclude,
    });
    return {
      outcome: 'created' as const,
      source: sourceView(row),
      warnings: resolved.warnings,
    };
  });
}

export async function updateGallerySource(
  input: z.input<typeof updateSourceSchema>,
) {
  const data = updateSourceSchema.parse(input);
  // Resolve network input outside the transaction. Omitted fields never clear data.
  const resolved = data.url
    ? await resolveGallerySource(data, { fetchName: false })
    : null;
  return write(async (tx) => {
    const current = await requireSource(tx, data.id);
    checkVersion(current, data.expectedUpdateTime);
    const type = resolved?.type ?? data.type ?? current.type;
    const requestedId =
      resolved?.platformId ?? data.platformId ?? current.producerId;
    const identityChanged =
      type !== current.type || requestedId !== current.producerId;
    // Name/tag edits must remain possible for legacy rows with incomplete IDs.
    const platformId = identityChanged
      ? normalizePlatformId(type, requestedId ?? '')
      : current.producerId;
    if (identityChanged) await rejectDuplicate(tx, type, platformId!, data.id);
    if (data.tagIds !== undefined) await validateTags(tx, data.tagIds);
    return sourceView(
      await tx.producer.update({
        where: { id: data.id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          type,
          producerId: platformId,
          ...(identityChanged ? { lastPostTime: null } : {}),
          updateTime: new Date(),
          ...(data.tagIds !== undefined
            ? {
                ProducerToProducerTag: {
                  deleteMany: {},
                  create: data.tagIds.map((B) => ({ B })),
                },
              }
            : {}),
        },
        include: sourceInclude,
      }),
    );
  });
}

export async function deleteGallerySource(id: string) {
  sourceIdSchema.parse({ id });
  return write(async (tx) => {
    const row = await requireSource(tx, id, false);
    if (row.deletedAt) return sourceView(row);
    return sourceView(
      await tx.producer.update({
        where: { id },
        data: { deletedAt: new Date() },
        include: sourceInclude,
      }),
    );
  });
}

export async function restoreGallerySource(id: string) {
  sourceIdSchema.parse({ id });
  return write(async (tx) => {
    const row = await requireSource(tx, id, false);
    if (!row.deletedAt) return sourceView(row);
    await rejectDuplicate(tx, row.type, row.producerId ?? '', id);
    return sourceView(
      await tx.producer.update({
        where: { id },
        data: { deletedAt: null },
        include: sourceInclude,
      }),
    );
  });
}

export async function changeGallerySourceTags(
  input: z.input<typeof changeSourceTagsSchema>,
) {
  const data = changeSourceTagsSchema.parse(input);
  return write(async (tx) => {
    const row = await requireSource(tx, data.id);
    checkVersion(row, data.expectedUpdateTime);
    await validateTags(tx, data.addTagIds);
    const ids = [
      ...new Set([
        ...row.ProducerToProducerTag.map((link) => link.B),
        ...data.addTagIds,
      ]),
    ].filter((id) => !data.removeTagIds.includes(id));
    return sourceView(
      await tx.producer.update({
        where: { id: data.id },
        data: {
          updateTime: new Date(),
          ProducerToProducerTag: {
            deleteMany: {},
            create: ids.map((B) => ({ B })),
          },
        },
        include: sourceInclude,
      }),
    );
  });
}

export async function listGalleryTags(
  input: z.input<typeof listTagsSchema> = {},
) {
  const query = listTagsSchema.parse(input);
  const rows = await prisma.producerTag.findMany({
    where: {
      deletedAt: null,
      ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    },
    orderBy: { id: 'asc' },
    take: query.limit + 1,
  });
  return {
    items: rows.slice(0, query.limit),
    nextCursor: rows.length > query.limit ? rows[query.limit - 1].id : null,
  };
}

export async function allGalleryTags() {
  return prisma.producerTag.findMany({
    where: { deletedAt: null },
    orderBy: { createTime: 'desc' },
  });
}

export async function createGalleryTag(input: z.input<typeof createTagSchema>) {
  const data = createTagSchema.parse(input);
  return write(async (tx) => {
    const existing = await tx.producerTag.findUnique({
      where: { name: data.name },
    });
    if (existing && !existing.deletedAt) return existing;
    if (existing)
      return tx.producerTag.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          remark: data.remark ?? null,
          ProducerToProducerTag: { deleteMany: {} },
        },
      });
    return tx.producerTag.create({ data });
  });
}

export async function updateGalleryTag(input: z.input<typeof updateTagSchema>) {
  const data = updateTagSchema.parse(input);
  return write(async (tx) => {
    const row = await tx.producerTag.findUnique({ where: { id: data.id } });
    if (!row || row.deletedAt)
      throw new GalleryConfigError('TAG_NOT_FOUND', '标签不存在或已删除。');
    if (data.name !== undefined) {
      const other = await tx.producerTag.findUnique({
        where: { name: data.name },
      });
      if (other && other.id !== data.id)
        throw new GalleryConfigError('DUPLICATE_TAG', '标签名称已存在。', {
          existingId: other.id,
        });
    }
    return tx.producerTag.update({
      where: { id: data.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.remark !== undefined ? { remark: data.remark } : {}),
      },
    });
  });
}

export async function deleteGalleryTag(id: string) {
  sourceIdSchema.parse({ id });
  return write(async (tx) => {
    const row = await tx.producerTag.findUnique({ where: { id } });
    if (!row) throw new GalleryConfigError('TAG_NOT_FOUND', '标签不存在。');
    if (row.deletedAt) return row;
    return tx.producerTag.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        ProducerToProducerTag: { deleteMany: {} },
      },
    });
  });
}
