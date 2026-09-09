'use client';

import { useState, type ReactNode } from 'react';
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
import { AutosizeTextarea } from '@/components/ui/AutosizeTextarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, getTagColor } from '@/lib/utils';
import {
  priorities,
  priorityConfig,
  statuses,
  statusConfig,
  taskPriority,
  taskStatus,
  TASK_STATUS,
  type UpdateTask,
} from '../task-model';

export interface TaskItemProps {
  task: Task;
  onUpdate: UpdateTask;
  pending?: boolean;
}

export function TaskName({ task, onUpdate, pending }: TaskItemProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function save() {
    if (draft === null || saving) return;
    const name = draft.trim();
    if (!name || name === task.name) {
      setDraft(null);
      return;
    }
    setSaving(true);
    const saved = await onUpdate(task.id, { name });
    setSaving(false);
    if (saved) setDraft(null);
  }
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <Checkbox
        className="mt-1 shrink-0"
        checked={task.status === TASK_STATUS.DONE}
        disabled={pending || saving}
        aria-label={`${task.status === TASK_STATUS.DONE ? '重新打开' : '完成'}任务：${task.name}`}
        onCheckedChange={(checked) =>
          void onUpdate(task.id, {
            status: checked ? TASK_STATUS.DONE : TASK_STATUS.TODO,
          })
        }
      />
      {draft !== null ? (
        <AutosizeTextarea
          autoFocus
          value={draft}
          minHeight={28}
          disabled={saving}
          aria-label="编辑任务名称"
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') {
              event.preventDefault();
              setDraft(null);
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void save();
            }
          }}
          className="min-w-0 flex-1 px-1 py-0.5"
        />
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => setDraft(task.name)}
          title="点击编辑任务名称"
          className={cn(
            'min-w-0 flex-1 rounded-sm text-left text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            task.status === TASK_STATUS.DONE &&
              'text-muted-foreground line-through',
          )}
        >
          {task.name}
        </button>
      )}
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

export function TaskPriority({ task, onUpdate, pending }: TaskItemProps) {
  return (
    <Select
      value={taskPriority(task)}
      disabled={pending}
      onValueChange={(priority) =>
        void onUpdate(task.id, { priority: priority as Task['priority'] })
      }
    >
      <SelectTrigger
        aria-label={`优先级：${task.name}`}
        className={cn(
          'h-8 w-[138px] shrink-0 text-xs',
          priorityConfig[taskPriority(task)].color,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {priorities.map((priority) => (
            <SelectItem key={priority} value={priority}>
              {priorityConfig[priority].label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function TaskState({ task, onUpdate, pending }: TaskItemProps) {
  return (
    <Select
      value={taskStatus(task)}
      disabled={pending}
      onValueChange={(status) => void onUpdate(task.id, { status })}
    >
      <SelectTrigger
        aria-label={`状态：${task.name}`}
        className={cn(
          'h-8 w-[100px] shrink-0 text-xs',
          statusConfig[taskStatus(task)].color,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {statuses.map((status) => (
            <SelectItem key={status} value={status}>
              {statusConfig[status].label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
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
        <TaskName {...props} />
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
        {dragHandle}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 px-3 pb-3">
        {task.remark && (
          <p className="line-clamp-3 pl-7 text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {task.remark}
          </p>
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
