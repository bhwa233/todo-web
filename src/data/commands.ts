import { Priority } from '@prisma/client';
import { z } from 'zod';

export const COMPLETED_PAGE_SIZE = 20;

const id = z.string().min(1).max(200);
const ids = z
  .array(id)
  .max(50)
  .transform((values) => [...new Set(values)]);
export const taskSaveSchema = z
  .object({
    id: id.optional(),
    data: z.object({
      name: z.string().trim().min(1).max(10000).optional(),
      remark: z.string().max(100000).optional(),
      status: z.enum(['0', '1', '2']).optional(),
      priority: z.enum(Priority).nullable().optional(),
      createTime: z.date().optional(),
      deletedAt: z.date().nullable().optional(),
    }),
    autoTag: z.boolean().optional(),
    tagNames: z.array(z.string().max(200)).max(50).optional(),
    tagIds: ids.optional(),
  })
  .strict();
export const taskTagsSchema = z
  .object({ id, tagIds: ids, expectedUpdateTime: z.date().optional() })
  .strict();
export const bookmarkSaveSchema = z
  .object({
    id,
    data: z.object({
      url: z.string().max(10000).optional(),
      title: z.string().nullable().optional(),
      image: z.string().nullable().optional(),
      remark: z.string().nullable().optional(),
      summary: z.string().nullable().optional(),
      loading: z.boolean().optional(),
      deletedAt: z.date().nullable().optional(),
      createTime: z.date().optional(),
    }),
    tagIds: ids,
  })
  .strict();
