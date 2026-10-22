'use server';
import { requireAdmin } from '../../lib/auth';
import { TaskTag as PrismaTaskTag } from '@prisma/client';
import { getTaskTags } from '../ai/aiActions';

import prisma from '../prisma';
import { callDataService } from '../../data/client';

export type TaskTag = Omit<PrismaTaskTag, 'deletedAt'>;

export interface NewTaskTag {
  name: string;
  remark?: string;
}

export const fetchTaskTags = async (): Promise<TaskTag[]> => {
  await requireAdmin();
  const tags = await prisma.taskTag.findMany({
    where: { deletedAt: null },
    orderBy: { createTime: 'desc' },
  });
  return tags.map(({ deletedAt, ...tag }) => tag);
};

export const createTaskTag = async (data: NewTaskTag): Promise<TaskTag> => {
  await requireAdmin();
  const tag = await prisma.taskTag.create({
    data,
  });
  const { deletedAt, ...result } = tag;
  return result;
};

export const deleteTaskTag = async (id: string): Promise<TaskTag> => {
  await requireAdmin();
  const tag = await prisma.taskTag.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  const { deletedAt, ...result } = tag;
  return result;
};

export const updateTaskTags = async (
  taskId: string,
  tagIds: string[],
): Promise<void> => {
  await requireAdmin();
  await callDataService('task/tags', { id: taskId, tagIds });
};

// 生成任务标签,返回标签id
export const generateTaskTags = async (content: string): Promise<TaskTag[]> => {
  await requireAdmin();
  const existedTags = await fetchTaskTags();
  const tags = await getTaskTags(
    content,
    existedTags.map((tag) => tag.name),
  );

  const newTags = await callDataService<PrismaTaskTag[]>(
    'task/ensureTags',
    tags,
  );

  return newTags.map(({ deletedAt, ...tag }) => tag);
};
