import { Priority } from '@prisma/client';
import type { Task } from '@/api/task/taskActions';

// Preserve existing persisted states; no migration is needed for the third state.
export const TASK_STATUS = { TODO: '0', DONE: '1', IN_PROGRESS: '2' } as const;
export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];
export interface TaskCreationDefaults {
  priority?: Priority;
  status?: TaskStatus;
}
export type OpenTaskComposer = (defaults?: TaskCreationDefaults) => void;
export type TaskView = 'cards' | 'list' | 'table' | 'matrix' | 'board';
export type TaskChanges = Partial<
  Pick<Task, 'name' | 'remark' | 'status' | 'priority'>
> & { tagNames?: string[] };
export type UpdateTask = (id: string, changes: TaskChanges) => Promise<boolean>;

export const priorityConfig = {
  [Priority.IMPORTANT_URGENT]: {
    label: '重要且紧急',
    hint: '优先处理',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400',
    border: 'border-t-red-500',
    weight: 4,
  },
  [Priority.IMPORTANT_NOT_URGENT]: {
    label: '重要不紧急',
    hint: '留出时间，持续推进',
    color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    border: 'border-t-orange-500',
    weight: 3,
  },
  [Priority.URGENT_NOT_IMPORTANT]: {
    label: '紧急不重要',
    hint: '快速处理或委托',
    color: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
    border: 'border-t-yellow-500',
    weight: 2,
  },
  [Priority.NOT_IMPORTANT_NOT_URGENT]: {
    label: '不重要不紧急',
    hint: '稍后再做',
    color: 'bg-muted text-muted-foreground',
    border: 'border-t-muted-foreground',
    weight: 1,
  },
};
export const priorities = Object.keys(priorityConfig) as Priority[];
export const statusConfig = {
  [TASK_STATUS.TODO]: {
    label: '待办',
    hint: '准备开始的任务',
    color: 'bg-muted text-muted-foreground',
  },
  [TASK_STATUS.IN_PROGRESS]: {
    label: '进行中',
    hint: '专注推进中的任务',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  [TASK_STATUS.DONE]: {
    label: '已完成',
    hint: '每一步都算数',
    color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  },
};
export const statuses: TaskStatus[] = [
  TASK_STATUS.TODO,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.DONE,
];
export const taskPriority = (task: Task) =>
  task.priority ?? Priority.NOT_IMPORTANT_NOT_URGENT;
export const taskStatus = (task: Task): TaskStatus =>
  statuses.includes(task.status as TaskStatus)
    ? (task.status as TaskStatus)
    : TASK_STATUS.TODO;

export type TaskSort = 'priority' | 'name' | 'status' | 'createTime';
export interface TaskFilters {
  search: string;
  tag: string;
  status: string;
  sort: TaskSort;
  descending: boolean;
}

// Domain filtering uses native collection operations; rendering reuses the shared Table.
export function selectTasks(tasks: Task[], filters: TaskFilters): Task[] {
  const query = filters.search.trim().toLocaleLowerCase();
  return tasks
    .filter((task) => {
      if (task.deletedAt) return false;
      if (filters.status !== 'all' && taskStatus(task) !== filters.status)
        return false;
      if (filters.tag === 'untagged' && task.tags.length > 0) return false;
      if (
        filters.tag !== 'all' &&
        filters.tag !== 'untagged' &&
        !task.tags.some((tag) => tag.id === filters.tag)
      )
        return false;
      return (
        !query ||
        [task.name, task.remark, ...task.tags.map((tag) => tag.name)].some(
          (value) => value.toLocaleLowerCase().includes(query),
        )
      );
    })
    .sort((a, b) => {
      let result = 0;
      switch (filters.sort) {
        case 'name':
          result = a.name.localeCompare(b.name, 'zh-CN', { numeric: true });
          break;
        case 'status':
          result =
            statuses.indexOf(taskStatus(a)) - statuses.indexOf(taskStatus(b));
          break;
        case 'createTime':
          result =
            new Date(a.createTime).getTime() - new Date(b.createTime).getTime();
          break;
        case 'priority':
          result =
            priorityConfig[taskPriority(a)].weight -
            priorityConfig[taskPriority(b)].weight;
          break;
      }
      return (
        (filters.descending ? -result : result) ||
        new Date(b.createTime).getTime() - new Date(a.createTime).getTime() ||
        a.id.localeCompare(b.id)
      );
    });
}
