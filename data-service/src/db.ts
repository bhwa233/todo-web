import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';

export function createDatabase(db: D1Database) {
  return new PrismaClient({ adapter: new PrismaD1(db) });
}
export type Database = ReturnType<typeof createDatabase>;
export const dateValue = (date: Date) =>
  date.toISOString().replace('Z', '+00:00');
export const nextVersion = (previous?: Date) =>
  new Date(Math.max(Date.now(), (previous?.getTime() ?? 0) + 1));
