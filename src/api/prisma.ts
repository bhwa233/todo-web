import type { PrismaClient } from '@prisma/client';
import { callDataService } from '../data/client';
import { models, reads, writes } from '../data/protocol';

// Reuse generated delegate types without starting a database engine in Next.js.
// Raw SQL and interactive transactions are absent; atomic domain writes use
// dedicated Worker endpoints backed by D1.batch().
const delegates: Record<string, unknown> = Object.fromEntries(
  models.map((model) => [
    model,
    Object.fromEntries(
      [...reads, ...writes].map((operation) => [
        operation,
        (args: unknown = {}) =>
          callDataService('query', { model, operation, args }),
      ]),
    ),
  ]),
);
const prisma = delegates as Pick<PrismaClient, (typeof models)[number]>;

export default prisma;
