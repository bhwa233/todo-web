'use client';

import { type ReactNode } from 'react';
import dayjs from 'dayjs';
import type { Task } from '@/api/task/taskActions';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, getTagColor } from '@/lib/utils';
import TaskText from './TaskText';
import {
  priorityConfig,
  statusConfig,
  taskPriority,
  taskStatus,
  TASK_STATUS,
  type UpdateTask,
} from '../task-model';

export interface TaskItemProps {
  task: Task;
  onUpdate: UpdateTask;
  onEdit: (task: Task) => void;
  pending?: boolean;
}

export function TaskName({ task, onUpdate, pending }: TaskItemProps) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <Checkbox
        className="mt-1 shrink-0"
        checked={task.status === TASK_STATUS.DONE}
        disabled={pending}
        aria-label={`${task.status === TASK_STATUS.DONE ? '重新打开' : '完成'}任务：${task.name}`}
        onCheckedChange={(checked) =>
          void onUpdate(task.id, {
            status: checked ? TASK_STATUS.DONE : TASK_STATUS.TODO,
          })
        }
      />
      <TaskText
        text={task.name}
        className={cn(
          'min-w-0 flex-1 text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]',
          task.status === TASK_STATUS.DONE &&
            'text-muted-foreground line-through',
        )}
      />
    </div>
  );
}

export function TaskTags({ task }: { task: Task }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {task.tags.map((tag) => (
        <Badge
          key={tag.id}
          variant="outline"
          className={cn('max-w-full break-all', getTagColor(tag.name))}
        >
          {tag.name}
        </Badge>
      ))}
    </div>
  );
}

export function TaskPriority({ task }: { task: Task }) {
  return (
    <Badge
      variant="secondary"
      className={priorityConfig[taskPriority(task)].color}
    >
      {priorityConfig[taskPriority(task)].label}
    </Badge>
  );
}

export function TaskState({ task }: { task: Task }) {
  return (
    <Badge variant="secondary" className={statusConfig[taskStatus(task)].color}>
      {statusConfig[taskStatus(task)].label}
    </Badge>
  );
}

export function TaskEditButton({
  task,
  onEdit,
  pending,
}: Pick<TaskItemProps, 'task' | 'onEdit' | 'pending'>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 shrink-0"
      disabled={pending}
      title="编辑任务"
      aria-label={`编辑任务：${task.name}`}
      onClick={() => onEdit(task)}
    >
      <Pencil />
    </Button>
  );
}

export default function TaskCard({
  compact = false,
  dragHandle,
  ...props
}: TaskItemProps & { compact?: boolean; dragHandle?: ReactNode }) {
  const { task } = props;
  if (compact)
    return (
      <div
        className="flex flex-col gap-2 border-b px-3 py-3 last:border-b-0 sm:flex-row sm:items-start sm:gap-4"
        aria-busy={props.pending}
      >
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <TaskName {...props} />
          <TaskEditButton {...props} />
        </div>
        <div className="flex flex-wrap items-center gap-2 pl-7 sm:max-w-[55%] sm:justify-end sm:pl-0">
          <TaskTags task={task} />
          <TaskState {...props} />
          <TaskPriority {...props} />
        </div>
      </div>
    );
  return (
    <Card
      className="flex h-full min-w-0 flex-col shadow-none transition-shadow hover:shadow-sm"
      aria-busy={props.pending}
    >
      <CardHeader className="flex-row items-start gap-2 p-3">
        <TaskName {...props} />
        <TaskEditButton {...props} />
        {dragHandle}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 px-3 pb-3">
        {task.remark && (
          <TaskText
            text={task.remark}
            className="pl-7 text-sm text-muted-foreground"
          />
        )}
        <div className="pl-7">
          <TaskTags task={task} />
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 px-3 pb-3">
        <TaskState {...props} />
        <TaskPriority {...props} />
        <time
          dateTime={new Date(task.createTime).toISOString()}
          title={`创建于 ${dayjs(task.createTime).format('YYYY/MM/DD HH:mm')}`}
          className="ml-auto text-xs tabular-nums text-muted-foreground"
        >
          {dayjs(task.createTime).format('MM/DD')}
        </time>
      </CardFooter>
    </Card>
  );
}
