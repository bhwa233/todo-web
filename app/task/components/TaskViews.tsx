'use client';

import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  ChevronDown,
  Plus,
} from 'lucide-react';
import dayjs from 'dayjs';
import dynamic from 'next/dynamic';
import type { Task } from '@/api/task/taskActions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import TaskCard, {
  TaskName,
  TaskPriority,
  TaskState,
  TaskTags,
} from './TaskCard';
import {
  priorities,
  priorityConfig,
  taskPriority,
  TASK_STATUS,
  type TaskFilters,
  type TaskSort,
  type TaskView,
  type UpdateTask,
  type OpenTaskComposer,
} from '../task-model';

const TaskBoard = dynamic(() => import('./TaskBoard'), {
  loading: () => <Skeleton className="h-72 w-full rounded-xl" />,
});

interface Props {
  tasks: Task[];
  view: TaskView;
  filters: TaskFilters;
  onSort: (column: TaskSort) => void;
  onUpdate: UpdateTask;
  pendingIds: ReadonlySet<string>;
  onCreate: OpenTaskComposer;
  creatingDisabled: boolean;
}

export default function TaskViews({
  tasks,
  view,
  filters,
  onSort,
  onUpdate,
  pendingIds,
  onCreate,
  creatingDisabled,
}: Props) {
  const activeTasks = tasks.filter((task) => task.status !== TASK_STATUS.DONE);
  const completed = tasks
    .filter((task) => task.status === TASK_STATUS.DONE)
    .sort(
      (a, b) =>
        new Date(b.updateTime).getTime() - new Date(a.updateTime).getTime(),
    );
  if (view === 'table') {
    const columns: { key: TaskSort; label: string }[] = [
      { key: 'name', label: '任务' },
      { key: 'status', label: '状态' },
      { key: 'priority', label: '优先级' },
      { key: 'createTime', label: '创建时间' },
    ];
    return (
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(({ key, label }) => (
                <TableHead
                  key={key}
                  scope="col"
                  aria-sort={
                    filters.sort === key
                      ? filters.descending
                        ? 'descending'
                        : 'ascending'
                      : 'none'
                  }
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSort(key)}
                    aria-label={`按${label}排序`}
                  >
                    {label}
                    {filters.sort !== key ? (
                      <ChevronsUpDown />
                    ) : filters.descending ? (
                      <ArrowDown />
                    ) : (
                      <ArrowUp />
                    )}
                  </Button>
                </TableHead>
              ))}
              <TableHead scope="col">标签</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => {
              const props = {
                task,
                onUpdate,
                pending: pendingIds.has(task.id),
              };
              return (
                <TableRow key={task.id} aria-busy={props.pending}>
                  <TableCell className="min-w-56 w-full max-w-lg p-4">
                    <TaskName {...props} />
                  </TableCell>
                  <TableCell>
                    <TaskState {...props} />
                  </TableCell>
                  <TableCell>
                    <TaskPriority {...props} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    {dayjs(task.createTime).format('YYYY/MM/DD HH:mm')}
                  </TableCell>
                  <TableCell className="min-w-32 max-w-60">
                    <TaskTags task={task} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }
  if (view === 'board')
    return (
      <TaskBoard
        mode="board"
        tasks={tasks}
        onUpdate={onUpdate}
        pendingIds={pendingIds}
        onCreate={onCreate}
        creatingDisabled={creatingDisabled}
      />
    );
  return (
    <div className="flex flex-col gap-5">
      {view === 'matrix' ? (
        <TaskBoard
          mode="matrix"
          tasks={activeTasks}
          onUpdate={onUpdate}
          pendingIds={pendingIds}
          onCreate={onCreate}
          creatingDisabled={creatingDisabled}
        />
      ) : (
        priorities.map((priority) => {
          const group = activeTasks.filter(
            (task) => taskPriority(task) === priority,
          );
          if (!group.length) return null;
          return (
            <Collapsible key={priority} defaultOpen>
              <div className="flex items-center gap-2">
                <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-2 text-left text-sm font-medium hover:bg-muted">
                  <ChevronDown className="size-4 transition-transform group-data-[state=closed]:-rotate-90" />
                  <span>{priorityConfig[priority].label}</span>
                  <Badge
                    variant="secondary"
                    className={priorityConfig[priority].color}
                  >
                    {group.length}
                  </Badge>
                </CollapsibleTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  disabled={creatingDisabled}
                  aria-label={`在${priorityConfig[priority].label}中新增任务`}
                  title="新增任务"
                  onClick={() => onCreate({ priority })}
                >
                  <Plus />
                </Button>
              </div>
              <CollapsibleContent>
                <div
                  className={cn(
                    view === 'list'
                      ? 'overflow-hidden rounded-xl border bg-card'
                      : 'grid gap-3 md:grid-cols-2 xl:grid-cols-3',
                  )}
                >
                  {group.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      compact={view === 'list'}
                      onUpdate={onUpdate}
                      pending={pendingIds.has(task.id)}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })
      )}
      {completed.length > 0 && (
        <Collapsible
          key={filters.status}
          defaultOpen={filters.status === TASK_STATUS.DONE}
        >
          <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-lg border-t px-1 py-3 text-left text-sm text-muted-foreground hover:bg-muted">
            <ChevronDown className="size-4 transition-transform group-data-[state=closed]:-rotate-90" />
            已完成<Badge variant="secondary">{completed.length}</Badge>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div
              className={cn(
                view === 'list'
                  ? 'overflow-hidden rounded-xl border bg-card'
                  : 'grid gap-3 md:grid-cols-2 xl:grid-cols-3',
              )}
            >
              {completed.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  compact={view === 'list'}
                  onUpdate={onUpdate}
                  pending={pendingIds.has(task.id)}
                />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
