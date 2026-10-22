import { enqueueAi } from './ai';
import { z } from 'zod';
import {
  taskSaveSchema,
  taskTagsSchema,
  COMPLETED_PAGE_SIZE,
} from '../../src/data/commands';
import { normalizeTaskTagNames } from '../../src/api/task/taskTagNames';
import { DataServiceError } from '../../src/data/protocol';
import { atomic, guard, insert, update } from './atomic';
import { dateValue, nextVersion, type Database } from './db';

const taskInclude = { tags: { where: { deletedAt: null } } };
function setTags(db: D1Database, id: string, ids: string[]) {
  return [
    db.prepare('DELETE FROM "_TaskToTaskTag" WHERE A = ?').bind(id),
    ...ids.map((tag) =>
      db
        .prepare('INSERT INTO "_TaskToTaskTag" (A,B) VALUES (?,?)')
        .bind(id, tag),
    ),
  ];
}

export async function taskCommand(
  db: D1Database,
  prisma: Database,
  operation: string,
  input: unknown,
) {
  if (operation === 'save' || operation === 'tags') {
    const data =
      operation === 'save'
        ? taskSaveSchema.parse(input)
        : taskTagsSchema.parse(input);
    return atomic(db, async () => {
      const row = data.id
        ? await prisma.task.findUnique({ where: { id: data.id } })
        : null;
      if (data.id && !row) throw new DataServiceError('P2025', '任务不存在。');
      if (
        'expectedUpdateTime' in data &&
        data.expectedUpdateTime &&
        row?.updateTime.getTime() !== data.expectedUpdateTime.getTime()
      )
        throw new DataServiceError(
          'CONFLICT',
          '任务已被修改，自动标签未覆盖当前选择。',
        );
      const id = row?.id ?? crypto.randomUUID();
      const now = nextVersion(row?.updateTime);
      const statements: D1PreparedStatement[] = row
        ? [
            guard(
              db,
              'EXISTS (SELECT 1 FROM Task WHERE id = ? AND updateTime = ?)',
              id,
              dateValue(row.updateTime),
            ),
          ]
        : [];
      let tagIds = data.tagIds;
      if ('tagNames' in data && data.tagNames !== undefined) {
        tagIds = [];
        const all = await prisma.taskTag.findMany();
        for (const name of normalizeTaskTagNames(data.tagNames)) {
          const existing =
            all.find(
              (tag) =>
                !tag.deletedAt &&
                tag.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
            ) ?? all.find((tag) => tag.name === name);
          const tagId = existing?.id ?? crypto.randomUUID();
          if (existing) {
            statements.push(
              guard(
                db,
                'EXISTS (SELECT 1 FROM TaskTag WHERE id = ? AND updateTime = ? AND deletedAt IS ?)',
                tagId,
                dateValue(existing.updateTime),
                existing.deletedAt ? dateValue(existing.deletedAt) : null,
              ),
            );
            if (existing.deletedAt)
              statements.push(
                db
                  .prepare('DELETE FROM "_TaskToTaskTag" WHERE B = ?')
                  .bind(tagId),
                update(db, 'TaskTag', tagId, {
                  deletedAt: null,
                  updateTime: now,
                }),
              );
          } else {
            statements.push(
              guard(
                db,
                'NOT EXISTS (SELECT 1 FROM TaskTag WHERE name = ? COLLATE NOCASE AND deletedAt IS NULL)',
                name,
              ),
              insert(db, 'TaskTag', {
                id: tagId,
                name,
                createTime: now,
                updateTime: now,
              }),
            );
          }
          tagIds.push(tagId);
        }
      } else if (tagIds?.length) {
        statements.push(
          guard(
            db,
            `(SELECT COUNT(*) FROM TaskTag WHERE deletedAt IS NULL AND id IN (${tagIds.map(() => '?').join(',')})) = ?`,
            ...tagIds,
            tagIds.length,
          ),
        );
      }
      const fields = 'data' in data ? data.data : {};
      if (!row && !fields.name)
        throw new DataServiceError('VALIDATION_ERROR', '任务名称不能为空。');
      statements.push(
        row
          ? update(db, 'Task', id, { ...fields, updateTime: now })
          : insert(db, 'Task', {
              id,
              remark: '',
              status: '0',
              createTime: now,
              ...fields,
              updateTime: now,
            }),
      );
      if (tagIds !== undefined) statements.push(...setTags(db, id, tagIds));
      if (
        'autoTag' in data &&
        data.autoTag &&
        tagIds === undefined &&
        fields.name
      )
        statements.push(enqueueAi(db, 'task-tags', id, now, fields.name));
      return {
        statements,
        result: () =>
          prisma.task.findUniqueOrThrow({
            where: { id },
            include: taskInclude,
          }),
      };
    });
  }
  if (operation === 'ensureTags') {
    const names = z.array(z.string().min(1).max(200)).max(50).parse(input);
    return atomic(db, async () => {
      const normalized = normalizeTaskTagNames(names);
      const now = nextVersion();
      return {
        statements: normalized.map((name) =>
          db
            .prepare(
              'INSERT OR IGNORE INTO TaskTag (id,name,createTime,updateTime) VALUES (?,?,?,?)',
            )
            .bind(crypto.randomUUID(), name, dateValue(now), dateValue(now)),
        ),
        result: () =>
          prisma.taskTag.findMany({
            where: { name: { in: normalized }, deletedAt: null },
          }),
      };
    });
  }
  if (operation === 'summary' || operation === 'page') {
    const data = z
      .object({
        search: z.string().max(10000),
        tag: z.string(),
        status: z.string(),
        cursor: z
          .object({ id: z.string().min(1), updateTime: z.iso.datetime() })
          .nullable()
          .optional(),
      })
      .parse(input);
    const search = data.search.trim().replace(/[\\%_]/g, '\\$&');
    const tag =
      data.tag === 'all'
        ? '1'
        : data.tag === 'untagged'
          ? 'NOT EXISTS (SELECT 1 FROM "_TaskToTaskTag" l JOIN TaskTag g ON l.B=g.id WHERE l.A=t.id AND g.deletedAt IS NULL)'
          : 'EXISTS (SELECT 1 FROM "_TaskToTaskTag" l JOIN TaskTag g ON l.B=g.id WHERE l.A=t.id AND g.deletedAt IS NULL AND g.id=?)';
    const params: unknown[] =
      data.tag !== 'all' && data.tag !== 'untagged' ? [data.tag] : [];
    const matches = search
      ? String.raw`(t.name LIKE ? ESCAPE '\' OR t.remark LIKE ? ESCAPE '\' OR EXISTS (SELECT 1 FROM "_TaskToTaskTag" l JOIN TaskTag g ON l.B=g.id WHERE l.A=t.id AND g.deletedAt IS NULL AND g.name LIKE ? ESCAPE '\'))`
      : '1';
    if (search) params.push(...Array(3).fill(`%${search}%`));
    if (operation === 'page') {
      const cursor = data.cursor
        ? 'AND (t.updateTime < ? OR (t.updateTime = ? AND t.id < ?))'
        : '';
      const after = data.cursor
        ? [
            dateValue(new Date(data.cursor.updateTime)),
            dateValue(new Date(data.cursor.updateTime)),
            data.cursor.id,
          ]
        : [];
      const rows = await db
        .prepare(
          `SELECT t.id FROM Task t WHERE t.deletedAt IS NULL AND t.status='1' AND ${['all', '1'].includes(data.status) ? '1' : '0'} AND (${tag}) AND (${matches}) ${cursor} ORDER BY t.updateTime DESC,t.id DESC LIMIT ?`,
        )
        .bind(...params, ...after, COMPLETED_PAGE_SIZE + 1)
        .all<{ id: string }>();
      const tasks = await prisma.task.findMany({
        where: { id: { in: rows.results.map((row) => row.id) } },
        orderBy: [{ updateTime: 'desc' }, { id: 'desc' }],
        include: taskInclude,
      });
      const items = tasks.slice(0, COMPLETED_PAGE_SIZE);
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          tasks.length > COMPLETED_PAGE_SIZE && last
            ? { id: last.id, updateTime: last.updateTime.toISOString() }
            : null,
      };
    }
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN ${['all', '1'].includes(data.status) ? '1' : '0'} AND (${tag}) AND (${matches}) THEN 1 ELSE 0 END),0) AS matching FROM Task t WHERE deletedAt IS NULL AND status='1'`,
      )
      .bind(...params)
      .first<{ total: number; matching: number }>();
    return row ?? { total: 0, matching: 0 };
  }
  throw new DataServiceError('NOT_FOUND', '未知任务操作。');
}
