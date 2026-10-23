import { DataServiceError } from '../../src/data/protocol';
import { dateValue } from './db';

type Table =
  | 'producer'
  | 'ProducerTag'
  | 'Task'
  | 'TaskTag'
  | 'Bookmark'
  | 'TrackItem'
  | 'TrackMeta'
  | 'Media';
const value = (input: unknown) =>
  input instanceof Date
    ? dateValue(input)
    : typeof input === 'boolean'
      ? Number(input)
      : input;
const fields = (data: Record<string, unknown>) =>
  Object.entries(data).filter(([, v]) => v !== undefined);
export function insert(
  db: D1Database,
  table: Table,
  data: Record<string, unknown>,
) {
  const entries = fields(data);
  return db
    .prepare(
      `INSERT INTO "${table}" (${entries.map(([k]) => `"${k}"`).join(',')}) VALUES (${entries.map(() => '?').join(',')})`,
    )
    .bind(...entries.map(([, v]) => value(v)));
}
export function update(
  db: D1Database,
  table: Table,
  id: string | number,
  data: Record<string, unknown>,
) {
  const entries = fields(data);
  return db
    .prepare(
      `UPDATE "${table}" SET ${entries.map(([k]) => `"${k}" = ?`).join(',')} WHERE id = ?`,
    )
    .bind(...entries.map(([, v]) => value(v)), id);
}

export function guard(db: D1Database, condition: string, ...values: unknown[]) {
  return db
    .prepare(
      `INSERT INTO "_MutationGuard" ("ok") SELECT CASE WHEN (${condition}) THEN 1 ELSE 0 END`,
    )
    .bind(...values);
}

// Prisma's D1 adapter ignores interactive transactions. Recheck the snapshot
// inside the atomic batch. A failed CHECK rolls back every write in the batch.
export async function atomic<T>(
  db: D1Database,
  operation: () => Promise<{
    statements: D1PreparedStatement[];
    result: () => Promise<T>;
  }>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const { statements, result } = await operation();
    try {
      await db.batch([
        ...statements,
        db.prepare('DELETE FROM "_MutationGuard"'),
      ]);
    } catch (error) {
      const message =
        error instanceof Error
          ? `${error.message} ${error.cause}`
          : String(error);
      if (message.includes('_mutation_guard')) {
        if (attempt < 4) continue;
        throw new DataServiceError(
          'CONFLICT',
          '数据已被并发修改，请重新查询后重试。',
        );
      }
      throw error;
    }
    return result();
  }
}
