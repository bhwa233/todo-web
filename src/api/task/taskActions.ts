'use server';
import {
  PrismaClient,
  Task as PrismaTask,
  TrackItem,
  TaskTag,
} from '@prisma/client';
import { fetchTrackMetas } from '../habitActions';
import { generateTaskTags } from './tagActions';

const prisma = new PrismaClient();
export type TaskType = 'task' | 'track';

export type Task = PrismaTask & {
  tags: TaskTag[];
};

export type NewTask = Omit<
  PrismaTask,
  'id' | 'createTime' | 'updateTime' | 'deletedAt'
>;

export const createTask = async (taskData: NewTask): Promise<Task> => {
  // 先创建任务
  const task = await prisma.task.create({
    data: {
      ...taskData,
    },
    include: {
      tags: true,
    },
  });

  // 异步生成和连接标签
  generateTaskTags(taskData.name || '')
    .then((tags) => {
      return prisma.task.update({
        where: { id: task.id },
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

export const updateTask = async (id: string, data: Partial<Task>) => {
  if (data.status !== undefined && !['0', '1', '2'].includes(data.status)) {
    throw new Error('Invalid task status');
  }
  if (data.name !== undefined && !data.name.trim()) {
    throw new Error('Task name cannot be empty');
  }
  // 从数据中提取 tags，并从更新数据中移除它
  const { tags, ...updateData } = data;

  return prisma.task.update({
    where: { id },
    data: {
      ...updateData,
      updateTime: new Date(),
      // 如果需要更新 tags，应该使用正确的关系更新语法
      ...(tags && {
        tags: {
          set: tags.map((tag) => ({ id: tag.id })),
        },
      }),
    },
    include: {
      tags: { where: { deletedAt: null } },
    },
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
