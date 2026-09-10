import type { Prisma, TaskTag } from '@prisma/client';
import { normalizeTaskTagNames } from './taskTagNames';

// Called inside the task's transaction: a failed task save must also roll back
// newly created labels. Existing tag actions commit independently.
export async function resolveTaskTagNames(
  tx: Prisma.TransactionClient,
  names: string[],
) {
  const tags: TaskTag[] = [];
  for (const name of normalizeTaskTagNames(names)) {
    const existing = await tx.taskTag.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, deletedAt: null },
    });
    let tag =
      existing ??
      (await tx.taskTag.upsert({
        where: { name },
        create: { name },
        update: {},
      }));
    if (tag.deletedAt) {
      // Reusing a deleted name must not restore its old task associations.
      tag = await tx.taskTag.update({
        where: { id: tag.id, deletedAt: tag.deletedAt },
        data: { deletedAt: null, updateTime: new Date(), tasks: { set: [] } },
      });
    }
    tags.push(tag);
  }
  return tags;
}
