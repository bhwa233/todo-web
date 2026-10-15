import { ProducerType } from '@prisma/client';
import { z } from 'zod';

const recordId = z.string().trim().min(1).max(200);
const name = z.string().trim().min(1).max(200);
const platformId = z.string().trim().min(1).max(200);
const tagIds = z
  .array(recordId)
  .max(50)
  .transform((ids) => [...new Set(ids)]);
export const sourceFields = {
  type: z
    .enum(ProducerType)
    .optional()
    .describe('来源类型；仅提供平台 ID 时必填。'),
  platformId: platformId
    .optional()
    .describe('平台账号或话题 ID，区别于配置记录的 id。'),
  url: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .optional()
    .describe('主页、话题、官方短链接，或包含一个链接的分享文本。'),
  name: name.optional().describe('优先使用指定名称；省略时尝试从页面获取。'),
};
export const resolveSourceSchema = z.object(sourceFields).strict();
export const createSourceSchema = z
  .object({
    ...sourceFields,
    tagIds: tagIds.optional().describe('现有标签记录 ID；省略则不关联标签。'),
  })
  .strict();
export const updateSourceSchema = z
  .object({
    id: recordId.describe('配置记录 ID，从查询结果获取。'),
    ...sourceFields,
    tagIds: tagIds.optional().describe('替换全部标签；省略不改，空数组清空。'),
    expectedUpdateTime: z.iso
      .datetime()
      .optional()
      .describe('可传查询返回的 updateTime，防止覆盖并发修改。'),
  })
  .strict()
  .refine(
    (value) =>
      ['name', 'type', 'platformId', 'url', 'tagIds'].some(
        (key) => key in value,
      ),
    {
      message: '至少提供一个要修改的字段。',
    },
  );
export const sourceIdSchema = z.object({ id: recordId }).strict();
export const listSourcesSchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    type: z.enum(ProducerType).optional(),
    platformId: platformId.optional(),
    tagId: recordId.optional(),
    untagged: z.boolean().optional(),
    includeDeleted: z.boolean().default(false),
    cursor: recordId.optional().describe('上一次返回的 nextCursor。'),
    limit: z.number().int().min(1).max(100).default(30),
  })
  .strict();
export const changeSourceTagsSchema = z
  .object({
    id: recordId,
    addTagIds: tagIds.default([]),
    removeTagIds: tagIds.default([]),
    expectedUpdateTime: z.iso.datetime().optional(),
  })
  .strict()
  .refine((value) => value.addTagIds.length + value.removeTagIds.length > 0, {
    message: '至少添加或移除一个标签。',
  })
  .refine(
    (value) => !value.addTagIds.some((id) => value.removeTagIds.includes(id)),
    {
      message: '不能同时添加和移除同一标签。',
    },
  );
export const createTagSchema = z
  .object({ name, remark: z.string().max(2000).optional() })
  .strict();
export const updateTagSchema = z
  .object({
    id: recordId,
    name: name.optional(),
    remark: z.string().max(2000).nullable().optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.remark !== undefined, {
    message: '至少提供名称或备注。',
  });
export const listTagsSchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    cursor: recordId.optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();
