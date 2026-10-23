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
import { resolveGallerySource } from './sourceResolver';
import { callDataService } from '../../data/client';
import { DataServiceError } from '../../data/protocol';

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
                name: { contains: query.search },
              },
              {
                producerId: {
                  contains: query.search,
                },
              },
              {
                ProducerToProducerTag: {
                  some: {
                    ProducerTag: {
                      deletedAt: null,
                      name: {
                        contains: query.search,
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

export async function listGalleryTags(
  input: z.input<typeof listTagsSchema> = {},
) {
  const query = listTagsSchema.parse(input);
  const rows = await prisma.producerTag.findMany({
    where: {
      deletedAt: null,
      ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      ...(query.search ? { name: { contains: query.search } } : {}),
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

async function command<T>(operation: string, input: unknown): Promise<T> {
  try {
    return await callDataService<T>(`gallery/${operation}`, input);
  } catch (error) {
    if (error instanceof DataServiceError)
      throw new GalleryConfigError(error.code, error.message, error.details);
    throw error;
  }
}
export async function createGallerySource(
  input: z.input<typeof createSourceSchema>,
) {
  const data = createSourceSchema.parse(input);
  const resolved = await resolveGallerySource(data);
  return command<{
    outcome: 'created' | 'already_exists' | 'deleted_exists';
    source: GallerySource;
    warnings: string[];
  }>('createSource', {
    ...data,
    type: resolved.type,
    platformId: resolved.platformId,
    name: resolved.name ?? undefined,
    warnings: resolved.warnings,
    url: undefined,
  });
}
export async function updateGallerySource(
  input: z.input<typeof updateSourceSchema>,
) {
  const data = updateSourceSchema.parse(input);
  const resolved = data.url
    ? await resolveGallerySource(data, { fetchName: false })
    : null;
  return command<GallerySource>('updateSource', {
    ...data,
    ...(resolved
      ? { type: resolved.type, platformId: resolved.platformId }
      : {}),
    url: undefined,
  });
}
export async function deleteGallerySource(id: string) {
  return command<GallerySource>('deleteSource', sourceIdSchema.parse({ id }));
}
export async function restoreGallerySource(id: string) {
  return command<GallerySource>('restoreSource', sourceIdSchema.parse({ id }));
}
export async function changeGallerySourceTags(
  input: z.input<typeof changeSourceTagsSchema>,
) {
  return command<GallerySource>(
    'changeSourceTags',
    changeSourceTagsSchema.parse(input),
  );
}
export async function createGalleryTag(input: z.input<typeof createTagSchema>) {
  return command<import('@prisma/client').ProducerTag>(
    'createTag',
    createTagSchema.parse(input),
  );
}
export async function updateGalleryTag(input: z.input<typeof updateTagSchema>) {
  return command<import('@prisma/client').ProducerTag>(
    'updateTag',
    updateTagSchema.parse(input),
  );
}
export async function deleteGalleryTag(id: string) {
  return command<import('@prisma/client').ProducerTag>(
    'deleteTag',
    sourceIdSchema.parse({ id }),
  );
}
