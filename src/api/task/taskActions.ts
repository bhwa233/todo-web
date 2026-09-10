'use server';
import {
  PrismaClient,
  Task as PrismaTask,
  TrackItem,
  TaskTag,
} from '@prisma/client';
import { resolveTaskTagNames } from './taskTagPersistence';
import { fetchTrackMetas } from '../habitActions';
import { generateTaskTags } from './tagActions';
import {
  COMPLETED_PAGE_SIZE,
  completedTaskWhere,
  completedTaskCursorWhere,
  type CompletedTaskQuery,
  type CompletedTaskCursor,
  type CompletedTaskPage,
  type CompletedTaskSummary,
} from './completedTasks';

const prisma = new PrismaClient();
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
  if (!taskData.name.trim()) throw new Error('Task name cannot be empty');
  const task = await prisma.$transaction(async (tx) => {
    const tags =
      tagNames === undefined ? [] : await resolveTaskTagNames(tx, tagNames);
    return tx.task.create({
      data: {
        ...taskData,
        name: taskData.name.trim(),
        tags: { connect: tags.map(({ id }) => ({ id })) },
      },
      include: { tags: { where: { deletedAt: null } } },
    });
  });
  // Explicit manual tags (including an empty selection) take precedence over AI.
  if (tagNames !== undefined) return task;

  // 异步生成和连接标签
  generateTaskTags(taskData.name || '')
    .then((tags) => {
      return prisma.task.update({
        where: { id: task.id, updateTime: task.updateTime },
        data: {
          tags: {
            connect: tags,
          },
        },
        include: {
          tags: true,
        },
      });
    })
    .catch((error) => {
      console.error('Failed to generate or connect tags:', error);
      // 可以在这里添加错误处理逻辑，例如记录日志或通知管理员
    });

  return task;
};

export const fetchTasks = async (): Promise<Task[]> => {
  return await prisma.task.findMany({
    where: { deletedAt: null },
    orderBy: { createTime: 'desc' },
    include: {
      tags: { where: { deletedAt: null } },
    },
  });
};

export const fetchActiveTasks = async (): Promise<Task[]> =>
  prisma.task.findMany({
    where: { deletedAt: null, status: { not: '1' } },
    orderBy: { createTime: 'desc' },
    include: { tags: { where: { deletedAt: null } } },
  });

export const fetchCompletedTaskSummary = async (
  query: CompletedTaskQuery,
): Promise<CompletedTaskSummary> => {
  const [total, matching] = await prisma.$transaction(
    [
      prisma.task.count({ where: { deletedAt: null, status: '1' } }),
      prisma.task.count({ where: completedTaskWhere(query) }),
    ],
    { isolationLevel: 'RepeatableRead' },
  );
  return { total, matching };
};

export const fetchCompletedTaskPage = async (
  query: CompletedTaskQuery,
  cursor: CompletedTaskCursor | null = null,
): Promise<CompletedTaskPage> => {
  const rows = await prisma.task.findMany({
    where: {
      AND: [
        completedTaskWhere(query),
        ...(cursor ? [completedTaskCursorWhere(cursor)] : []),
      ],
    },
    orderBy: [{ updateTime: 'desc' }, { id: 'desc' }],
    take: COMPLETED_PAGE_SIZE + 1,
    include: { tags: { where: { deletedAt: null } } },
  });
  const items = rows.slice(0, COMPLETED_PAGE_SIZE);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > COMPLETED_PAGE_SIZE && last
        ? { id: last.id, updateTime: last.updateTime.toISOString() }
        : null,
  };
};

// 聚合查询
export interface AggregatedTask extends Task {
  type: TaskType;
  countItems?: TrackItem[];
  updatedAt: string | Date;
}

export const fetchAggregatedTask = async () => {
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
  if (data.status !== undefined && !['0', '1', '2'].includes(data.status)) {
    throw new Error('Invalid task status');
  }
  if (data.name !== undefined && !data.name.trim()) {
    throw new Error('Task name cannot be empty');
  }
  const { tags, ...updateData } = data;
  return prisma.$transaction(async (tx) => {
    const resolved =
      tagNames === undefined ? tags : await resolveTaskTagNames(tx, tagNames);
    return tx.task.update({
      where: { id },
      data: {
        ...updateData,
        updateTime: new Date(),
        ...(resolved && { tags: { set: resolved.map(({ id }) => ({ id })) } }),
      },
      include: { tags: { where: { deletedAt: null } } },
    });
  });
};

export const deleteTask = async (id: string): Promise<Task> => {
  return await prisma.task.delete({
    where: { id },
    include: {
      tags: true,
    },
  });
};
