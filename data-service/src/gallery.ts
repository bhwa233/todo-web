import { z } from 'zod';
import { ProducerType, type Prisma } from '@prisma/client';
import {
  createSourceSchema,
  updateSourceSchema,
  changeSourceTagsSchema,
  createTagSchema,
  updateTagSchema,
  sourceIdSchema,
} from '../../src/api/gallery/configSchemas';
import { normalizePlatformId } from '../../src/api/gallery/sourceIdentity';
import { DataServiceError } from '../../src/data/protocol';
import { atomic, guard, insert, update } from './atomic';
import { dateValue, nextVersion, type Database } from './db';

const include = {
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
type Source = Prisma.ProducerGetPayload<{ include: typeof include }>;
const view = ({ ProducerToProducerTag: links, _count, ...source }: Source) => ({
  ...source,
  tags: links.map((link) => link.ProducerTag),
  mediaCount: _count.medias,
  postCount: _count.posts,
});

async function source(prisma: Database, id: string, active = true) {
  const row = await prisma.producer.findUnique({ where: { id }, include });
  if (!row || (active && row.deletedAt))
    throw new DataServiceError('SOURCE_NOT_FOUND', '来源不存在或已删除。', {
      id,
    });
  return row;
}
const sourceVersion = (db: D1Database, row: Source) =>
  guard(
    db,
    'EXISTS (SELECT 1 FROM producer WHERE id = ? AND updateTime = ?)',
    row.id,
    dateValue(row.updateTime),
  );
async function validTags(db: D1Database, prisma: Database, ids: string[]) {
  if (!ids.length) return [];
  const count = await prisma.producerTag.count({
    where: { id: { in: ids }, deletedAt: null },
  });
  if (count !== ids.length)
    throw new DataServiceError('TAG_NOT_FOUND', '部分标签不存在或已删除。');
  return [
    guard(
      db,
      `(SELECT COUNT(*) FROM ProducerTag WHERE deletedAt IS NULL AND id IN (${ids.map(() => '?').join(',')})) = ?`,
      ...ids,
      ids.length,
    ),
  ];
}
function replaceTags(db: D1Database, id: string, ids: string[]) {
  return [
    db.prepare('DELETE FROM "_ProducerToProducerTag" WHERE A = ?').bind(id),
    ...ids.map((tag) =>
      db
        .prepare('INSERT INTO "_ProducerToProducerTag" (A,B) VALUES (?,?)')
        .bind(id, tag),
    ),
  ];
}
async function uniqueSource(
  db: D1Database,
  prisma: Database,
  type: ProducerType,
  platformId: string | null,
  id: string,
) {
  const duplicate = await prisma.producer.findFirst({
    where: { type, producerId: platformId, deletedAt: null, id: { not: id } },
  });
  if (duplicate)
    throw new DataServiceError('DUPLICATE_SOURCE', '该来源已经存在。', {
      existingId: duplicate.id,
    });
  return guard(
    db,
    'NOT EXISTS (SELECT 1 FROM producer WHERE type = ? AND producerId IS ? AND deletedAt IS NULL AND id <> ?)',
    type,
    platformId,
    id,
  );
}

export async function galleryCommand(
  db: D1Database,
  prisma: Database,
  operation: string,
  input: unknown,
) {
  if (operation === 'createSource') {
    const data = createSourceSchema
      .extend({
        type: z.enum(ProducerType),
        platformId: z.string(),
        warnings: z.array(z.string()).default([]),
      })
      .parse(input);
    const platformId = normalizePlatformId(data.type, data.platformId);
    return atomic(db, async () => {
      const existing = await prisma.producer.findFirst({
        where: { type: data.type, producerId: platformId },
        orderBy: [
          { deletedAt: { sort: 'asc', nulls: 'first' } },
          { id: 'asc' },
        ],
        include,
      });
      if (existing)
        return {
          statements: [],
          result: async () => ({
            outcome: existing.deletedAt ? 'deleted_exists' : 'already_exists',
            source: view(existing),
            warnings: existing.deletedAt
              ? ['来源已删除；调用 gallery_restore_source 恢复。']
              : ['已存在；本次没有修改名称或标签。'],
          }),
        };
      if (!data.name)
        throw new DataServiceError(
          'NAME_REQUIRED',
          '无法自动获取来源名称，请显式提供 name。',
        );
      const id = crypto.randomUUID();
      const now = nextVersion();
      return {
        statements: [
          guard(
            db,
            'NOT EXISTS (SELECT 1 FROM producer WHERE type = ? AND producerId = ?)',
            data.type,
            platformId,
          ),
          ...(await validTags(db, prisma, data.tagIds ?? [])),
          insert(db, 'producer', {
            id,
            name: data.name,
            type: data.type,
            producerId: platformId,
            createTime: now,
            updateTime: now,
          }),
          ...replaceTags(db, id, data.tagIds ?? []),
        ],
        result: async () => ({
          outcome: 'created',
          source: view(await source(prisma, id)),
          warnings: data.warnings,
        }),
      };
    });
  }
  if (
    [
      'updateSource',
      'deleteSource',
      'restoreSource',
      'changeSourceTags',
    ].includes(operation)
  ) {
    const data =
      operation === 'updateSource'
        ? updateSourceSchema.parse(input)
        : operation === 'changeSourceTags'
          ? changeSourceTagsSchema.parse(input)
          : sourceIdSchema.parse(input);
    return atomic(db, async () => {
      const row = await source(
        prisma,
        data.id,
        operation === 'updateSource' || operation === 'changeSourceTags',
      );
      const expected =
        operation === 'updateSource'
          ? updateSourceSchema.parse(input).expectedUpdateTime
          : operation === 'changeSourceTags'
            ? changeSourceTagsSchema.parse(input).expectedUpdateTime
            : undefined;
      if (expected && row.updateTime.getTime() !== new Date(expected).getTime())
        throw new DataServiceError(
          'CONFLICT',
          '配置已被修改，请重新查询后再操作。',
        );
      const statements = [sourceVersion(db, row)];
      const changes: Record<string, unknown> = {
        updateTime: nextVersion(row.updateTime),
      };
      let tagIds: string[] | undefined;
      if (operation === 'deleteSource') {
        if (row.deletedAt)
          return { statements: [], result: async () => view(row) };
        changes.deletedAt = new Date();
      } else if (operation === 'restoreSource') {
        if (!row.deletedAt)
          return { statements: [], result: async () => view(row) };
        statements.push(
          await uniqueSource(db, prisma, row.type, row.producerId, row.id),
        );
        changes.deletedAt = null;
      } else if (operation === 'changeSourceTags') {
        const tags = changeSourceTagsSchema.parse(input);
        statements.push(...(await validTags(db, prisma, tags.addTagIds)));
        tagIds = [
          ...new Set([
            ...row.ProducerToProducerTag.map((link) => link.B),
            ...tags.addTagIds,
          ]),
        ].filter((id) => !tags.removeTagIds.includes(id));
      } else if (operation === 'updateSource') {
        const parsed = updateSourceSchema.parse(input);
        const type = parsed.type ?? row.type;
        const platformId = parsed.platformId ?? row.producerId;
        if (type !== row.type || platformId !== row.producerId) {
          const normalized = normalizePlatformId(type, platformId ?? '');
          statements.push(
            await uniqueSource(db, prisma, type, normalized, row.id),
          );
          changes.type = type;
          changes.producerId = normalized;
          changes.lastPostTime = null;
        }
        changes.name = parsed.name;
        tagIds = parsed.tagIds;
      }
      if (tagIds) statements.push(...(await validTags(db, prisma, tagIds)));
      statements.push(update(db, 'producer', row.id, changes));
      if (tagIds) statements.push(...replaceTags(db, row.id, tagIds));
      return {
        statements,
        result: async () => view(await source(prisma, row.id, false)),
      };
    });
  }
  if (['createTag', 'updateTag', 'deleteTag'].includes(operation)) {
    const data =
      operation === 'createTag'
        ? createTagSchema.parse(input)
        : operation === 'updateTag'
          ? updateTagSchema.parse(input)
          : sourceIdSchema.parse(input);
    return atomic(db, async () => {
      const row =
        'id' in data
          ? await prisma.producerTag.findUnique({ where: { id: data.id } })
          : await prisma.producerTag.findUnique({ where: { name: data.name } });
      if (operation !== 'createTag' && !row)
        throw new DataServiceError('TAG_NOT_FOUND', '标签不存在或已删除。');
      if (operation === 'createTag' && row && !row.deletedAt)
        return { statements: [], result: async () => row };
      if (operation === 'updateTag' && row?.deletedAt)
        throw new DataServiceError('TAG_NOT_FOUND', '标签不存在或已删除。');
      const id = row?.id ?? crypto.randomUUID();
      const now = nextVersion(row?.updateTime);
      const statements: D1PreparedStatement[] = [];
      if (row)
        statements.push(
          guard(
            db,
            'EXISTS (SELECT 1 FROM ProducerTag WHERE id = ? AND updateTime = ?)',
            id,
            dateValue(row.updateTime),
          ),
        );
      if ('name' in data && data.name) {
        const duplicate = await prisma.producerTag.findUnique({
          where: { name: data.name },
        });
        if (duplicate && duplicate.id !== id)
          throw new DataServiceError('DUPLICATE_TAG', '标签名称已存在。', {
            existingId: duplicate.id,
          });
        statements.push(
          guard(
            db,
            'NOT EXISTS (SELECT 1 FROM ProducerTag WHERE name = ? AND id <> ?)',
            data.name,
            id,
          ),
        );
      }
      const changes = {
        ...('name' in data ? { name: data.name } : {}),
        ...('remark' in data ? { remark: data.remark } : {}),
        deletedAt: operation === 'deleteTag' ? now : null,
        updateTime: now,
      };
      if (operation === 'createTag' && row?.deletedAt)
        statements.push(
          db
            .prepare('DELETE FROM "_ProducerToProducerTag" WHERE B = ?')
            .bind(id),
        );
      statements.push(
        row
          ? update(db, 'ProducerTag', id, changes)
          : insert(db, 'ProducerTag', { id, createTime: now, ...changes }),
      );
      return {
        statements,
        result: () => prisma.producerTag.findUniqueOrThrow({ where: { id } }),
      };
    });
  }
  throw new DataServiceError('NOT_FOUND', '未知图库操作。');
}
