import { enqueueAi } from './ai';
import { z } from 'zod';
import { bookmarkSaveSchema } from '../../src/data/commands';
import { DataServiceError } from '../../src/data/protocol';
import { atomic, guard, insert, update } from './atomic';
import { dateValue, nextVersion, type Database } from './db';

export async function recordCommand(
  db: D1Database,
  prisma: Database,
  operation: string,
  input: unknown,
) {
  if (operation === 'createBookmark') {
    const data = z
      .object({
        url: z.url().max(10000),
        title: z.string().max(10000).default(''),
        image: z.string().max(10000).default(''),
        remark: z.string().max(100000).default(''),
        content: z.string().max(60000).optional(),
      })
      .parse(input);
    return atomic(db, async () => {
      const row = await prisma.bookmark.findUnique({
        where: { url: data.url },
      });
      const id = row?.id ?? crypto.randomUUID();
      const now = nextVersion(row?.updateTime);
      const { content, ...fields } = data;
      const statements = row
        ? [
            guard(
              db,
              'EXISTS (SELECT 1 FROM Bookmark WHERE id=? AND updateTime=?)',
              id,
              dateValue(row.updateTime),
            ),
            update(db, 'Bookmark', id, {
              ...fields,
              loading: Boolean(content?.trim()),
              updateTime: now,
            }),
          ]
        : [
            insert(db, 'Bookmark', {
              id,
              ...fields,
              loading: Boolean(content?.trim()),
              createTime: now,
              updateTime: now,
            }),
          ];
      if (content?.trim())
        statements.push(enqueueAi(db, 'bookmark-summary', id, now, content));
      return {
        statements,
        result: () =>
          prisma.bookmark.findUniqueOrThrow({
            where: { id },
            include: { tags: true },
          }),
      };
    });
  }
  if (operation === 'bookmark') {
    const data = bookmarkSaveSchema.parse(input);
    return atomic(db, async () => {
      const row = await prisma.bookmark.findUnique({ where: { id: data.id } });
      if (!row) throw new DataServiceError('P2025', '书签不存在。');
      return {
        statements: [
          guard(
            db,
            'EXISTS (SELECT 1 FROM Bookmark WHERE id=? AND updateTime=?)',
            row.id,
            dateValue(row.updateTime),
          ),
          update(db, 'Bookmark', row.id, {
            ...data.data,
            updateTime: nextVersion(row.updateTime),
          }),
          db
            .prepare('DELETE FROM "_BookmarkToBookmarkTag" WHERE A=?')
            .bind(row.id),
          ...data.tagIds.map((id) =>
            db
              .prepare(
                'INSERT INTO "_BookmarkToBookmarkTag" (A,B) VALUES (?,?)',
              )
              .bind(row.id, id),
          ),
        ],
        result: () =>
          prisma.bookmark.findUniqueOrThrow({
            where: { id: row.id },
            include: { tags: true },
          }),
      };
    });
  }
  if (operation === 'createTrackItem') {
    const data = z
      .object({
        countMetaId: z.string().min(1),
        createTime: z.date(),
        remark: z.string(),
      })
      .parse(input);
    const now = nextVersion();
    await db.batch([
      insert(db, 'TrackItem', {
        id: crypto.randomUUID(),
        ...data,
        updateTime: now,
      }),
      update(db, 'TrackMeta', data.countMetaId, { updateTime: now }),
    ]);
    return prisma.trackMeta.findUniqueOrThrow({
      where: { id: data.countMetaId },
      include: { countItems: { orderBy: { createTime: 'desc' } } },
    });
  }
  if (operation === 'deleteTrackItem') {
    const { id } = z.object({ id: z.string().min(1) }).parse(input);
    return atomic(db, async () => {
      const row = await prisma.trackItem.findUnique({ where: { id } });
      if (!row) throw new DataServiceError('P2025', '打卡记录不存在。');
      return {
        statements: [
          guard(
            db,
            'EXISTS (SELECT 1 FROM TrackItem WHERE id=? AND countMetaId IS ?)',
            id,
            row.countMetaId,
          ),
          db.prepare('DELETE FROM TrackItem WHERE id=?').bind(id),
          ...(row.countMetaId
            ? [
                update(db, 'TrackMeta', row.countMetaId, {
                  updateTime: nextVersion(),
                }),
              ]
            : []),
        ],
        result: async () => row,
      };
    });
  }
  throw new DataServiceError('NOT_FOUND', '未知记录操作。');
}
