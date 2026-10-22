import { z } from 'zod';
import type { Database } from './db';
const schema = z
  .object({
    seed: z.number().int(),
    skip: z.number().int().min(0).max(1000000),
    limit: z.number().int().min(1).max(100),
    producerId: z.string().nullable(),
    type: z.enum(['image', 'video', 'livephoto']).nullable(),
    tagIds: z.array(z.string()).max(50).nullable(),
  })
  .strict();

export async function randomMediaPage(
  db: D1Database,
  prisma: Database,
  input: unknown,
) {
  const data = schema.parse(input);
  const conditions = ['m.deletedAt IS NULL', "m.status='UPLOADED'"];
  const params: (string | number)[] = [];
  if (data.producerId) {
    conditions.push('m.producerId=?');
    params.push(data.producerId);
  }
  if (data.tagIds?.length) {
    conditions.push(
      `EXISTS (SELECT 1 FROM "_ProducerToProducerTag" l WHERE l.A=m.producerId AND l.B IN (${data.tagIds.map(() => '?').join(',')}))`,
    );
    params.push(...data.tagIds);
  }
  if (data.type) {
    const extensions =
      data.type === 'image'
        ? ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']
        : data.type === 'video'
          ? ['.mp4', '.mov']
          : ['.mov'];
    conditions.push(
      `(${extensions.map(() => 'm.galleryMediaUrl LIKE ?').join(' OR ')})`,
    );
    params.push(...extensions.map((ext) => `%${ext}`));
  }
  const pivot = (Math.imul(data.seed | 0, 1664525) + 1013904223) >>> 1;
  const descending = Boolean(data.seed & 1);
  const order = descending ? 'DESC' : 'ASC';
  const first = descending ? '<=' : '>=';
  const second = descending ? '>' : '<';
  const from = `FROM "_MediaRandom" r INDEXED BY "_MediaRandom_order" JOIN Media m ON m.id=r.mediaId WHERE ${conditions.join(' AND ')} AND r.slot`;
  const query = async (range: string, skip: number, limit: number) =>
    (
      await db
        .prepare(
          `SELECT m.id ${from}${range}? ORDER BY r.slot ${order},r.mediaId ${order} LIMIT ? OFFSET ?`,
        )
        .bind(...params, pivot, limit, skip)
        .all<{ id: number }>()
    ).results;
  const selected = await query(first, data.skip, data.limit);
  if (selected.length < data.limit) {
    const firstCount = Number(
      (
        await db
          .prepare(`SELECT COUNT(*) AS total ${from}${first}?`)
          .bind(...params, pivot)
          .first<{ total: number }>()
      )?.total ?? 0,
    );
    selected.push(
      ...(await query(
        second,
        Math.max(0, data.skip - firstCount),
        data.limit - selected.length,
      )),
    );
  }
  const media = await prisma.media.findMany({
    where: { id: { in: selected.map((row) => row.id) } },
    include: { producer: true, post: true },
  });
  const byId = new Map(media.map((row) => [row.id, row]));
  return selected.map((row) => byId.get(row.id)!);
}
