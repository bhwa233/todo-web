'use server';
import { requireAdmin } from '../../lib/auth';
import { Task as PrismaTask, TrackItem, TaskTag } from '@prisma/client';
import prisma from '../prisma';
import { callDataService } from '../../data/client';
import { fetchTrackMetas } from '../habitActions';
import {
  type CompletedTaskQuery,
  type CompletedTaskCursor,
  type CompletedTaskPage,
  type CompletedTaskSummary,
} from './completedTasks';

export type TaskType = 'task' | 'track';

export type Task = PrismaTask & {
  tags: TaskTag[];
};

export type NewTask = Omit<
  PrismaTask,
  'id' | 'createTime' | 'updateTime' | 'deletedAt'
>;

export const createTask = async (
  taskData: NewTask,
  tagNames?: string[],
): Promise<Task> => {
  await requireAdmin();
  if (!taskData.name.trim()) throw new Error('Task name cannot be empty');
  const task = await callDataService<Task>('task/save', {
    data: taskData,
    tagNames,
    autoTag: tagNames === undefined,
  });
  return task;
};

export const fetchTasks = async (): Promise<Task[]> => {
  await requireAdmin();
  return await prisma.task.findMany({
    where: { deletedAt: null },
    orderBy: { createTime: 'desc' },
    include: {
      tags: { where: { deletedAt: null } },
    },
  });
};

export const fetchActiveTasks = async (): Promise<Task[]> =>
  { await requireAdmin(); return (prisma.task.findMany({
    where: { deletedAt: null, status: { not: '1' } },
    orderBy: { createTime: 'desc' },
    include: { tags: { where: { deletedAt: null } } },
  })); };

export const fetchCompletedTaskSummary = async (
  query: CompletedTaskQuery,
): Promise<CompletedTaskSummary> => {
  await requireAdmin();
  return callDataService<CompletedTaskSummary>('task/summary', query);
};

export const fetchCompletedTaskPage = async (
  query: CompletedTaskQuery,
  cursor: CompletedTaskCursor | null = null,
): Promise<CompletedTaskPage> => {
  await requireAdmin();
  return callDataService<CompletedTaskPage>('task/page', { ...query, cursor });
};

// 聚合查询
export interface AggregatedTask extends Task {
  type: TaskType;
  countItems?: TrackItem[];
  updatedAt: string | Date;
}

export const fetchAggregatedTask = async () => {
  await requireAdmin();
  const tasks = await fetchTasks();
  const tracks = await fetchTrackMetas();
  const taskItems = tasks.map((item) => ({ ...item, type: 'task' }));
  const trackItems = tracks.map((item) => {
    const todayTrackItem = item.countItems.find((countItem) => {
      return (
        new Date(countItem.createTime).toDateString() ===
        new Date().toDateString()
      );
    });
    return {
      ...item,
      type: 'track',
      status: todayTrackItem ? '1' : '0',
      tags: [],
    };
  });
  return [...taskItems, ...trackItems] as AggregatedTask[];
};

export const updateTask = async (
  id: string,
  data: Partial<Task>,
  tagNames?: string[],
): Promise<Task> => {
  await requireAdmin();
  if (data.status !== undefined && !['0', '1', '2'].includes(data.status)) {
    throw new Error('Invalid task status');
  }
  if (data.name !== undefined && !data.name.trim()) {
    throw new Error('Task name cannot be empty');
  }
  const { tags, ...updateData } = data;
  return callDataService<Task>('task/save', {
    id,
    data: updateData,
    tagNames,
    ...(tagNames === undefined && tags
      ? { tagIds: tags.map(({ id }) => id) }
      : {}),
  });
};

export const deleteTask = async (id: string): Promise<Task> => {
  await requireAdmin();
  return await prisma.task.delete({
    where: { id },
    include: {
      tags: true,
    },
  });
};
