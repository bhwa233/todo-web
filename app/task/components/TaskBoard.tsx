'use client';

import { useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type KeyboardCoordinateGetter,
  type CollisionDetection,
} from '@dnd-kit/core';
import { GripVertical, Plus } from 'lucide-react';
import type { Task } from '@/api/task/taskActions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import TaskCard, { type TaskItemProps } from './TaskCard';
import {
  priorities,
  priorityConfig,
  statuses,
  statusConfig,
  taskPriority,
  taskStatus,
  TASK_STATUS,
  type OpenTaskComposer,
  type TaskCreationDefaults,
  type TaskChanges,
  type UpdateTask,
} from '../task-model';

// Keep the drag library behind this task-specific boundary. Only group changes
// are persisted; positions within a group continue to follow the selected sort.
const collisions: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);
const groupCoordinates: KeyboardCoordinateGetter = (
  event,
  { context, currentCoordinates },
) => {
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.code))
    return;
  event.preventDefault();
  const { collisionRect, droppableContainers, droppableRects } = context;
  if (!collisionRect) return;
  const x = collisionRect.left + collisionRect.width / 2;
  const y = collisionRect.top + collisionRect.height / 2;
  const candidates = droppableContainers
    .getEnabled()
    .flatMap((container) => {
      const rect = droppableRects.get(container.id);
      if (!rect) return [];
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const horizontal =
        event.code === 'ArrowRight' || event.code === 'ArrowLeft';
      const forward = event.code === 'ArrowRight' || event.code === 'ArrowDown';
      const delta = horizontal ? cx - x : cy - y;
      if (
        (forward ? delta <= 1 : delta >= -1) ||
        container.id === context.over?.id
      )
        return [];
      return [
        {
          rect,
          cx,
          cy,
          distance:
            Math.abs(delta) + Math.abs(horizontal ? cy - y : cx - x) * 2,
        },
      ];
    })
    .sort((a, b) => a.distance - b.distance);
  const next = candidates[0];
  return next
    ? {
        x: currentCoordinates.x + next.cx - x,
        y: currentCoordinates.y + next.cy - y,
      }
    : undefined;
};

function DraggableTask(props: TaskItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
    useDraggable({
      id: props.task.id,
      disabled: props.pending,
      data: { name: props.task.name },
    });
  return (
    <div ref={setNodeRef} className={cn('min-w-0', isDragging && 'opacity-30')}>
      <TaskCard
        {...props}
        dragHandle={
          <Button
            ref={setActivatorNodeRef}
            type="button"
            size="icon"
            variant="ghost"
            disabled={props.pending}
            className="size-7 shrink-0 touch-none cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label={`拖动任务：${props.task.name}`}
          >
            <GripVertical />
          </Button>
        }
      />
    </div>
  );
}

function TaskDropZone({
  id,
  label,
  hint,
  color,
  border,
  count,
  children,
  onCreate,
  creatingDisabled,
}: {
  id: string;
  label: string;
  hint: string;
  color: string;
  border?: string;
  count: number;
  children: ReactNode;
  onCreate?: () => void;
  creatingDisabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { label } });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-xl border border-t-2 bg-muted/30 p-3 transition-colors sm:p-4',
        border,
        isOver && 'bg-accent ring-2 ring-ring',
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">{label}</h2>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className={color}>
            {count}
          </Badge>
          {onCreate && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              disabled={creatingDisabled}
              aria-label={`在${label}中新增任务`}
              title="新增任务"
              onClick={onCreate}
            >
              <Plus />
            </Button>
          )}
        </div>
      </header>
      <div className="flex min-h-28 flex-1 flex-col gap-3">
        {count ? (
          children
        ) : (
          <p className="flex min-h-28 flex-1 items-center justify-center rounded-lg border border-dashed px-4 text-center text-xs text-muted-foreground">
            暂无任务，可拖到这里
          </p>
        )}
      </div>
    </section>
  );
}

export default function TaskBoard({
  mode,
  tasks,
  onUpdate,
  pendingIds,
  onCreate,
  creatingDisabled,
}: {
  mode: 'matrix' | 'board';
  tasks: Task[];
  onUpdate: UpdateTask;
  pendingIds: ReadonlySet<string>;
  onCreate: OpenTaskComposer;
  creatingDisabled: boolean;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: groupCoordinates }),
  );
  const groups =
    mode === 'matrix'
      ? priorities.map((priority) => ({
          id: priority,
          ...priorityConfig[priority],
          changes: { priority } as TaskChanges,
          items: tasks.filter((task) => taskPriority(task) === priority),
        }))
      : statuses.map((status) => ({
          id: status,
          ...statusConfig[status],
          border: undefined,
          changes: { status } as TaskChanges,
          items: tasks.filter((task) => taskStatus(task) === status),
        }));
  const activeTask = tasks.find((task) => task.id === activeId);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisions}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            '按空格或回车拾起任务，方向键切换区域，空格或回车放下，Escape 取消。也可直接修改任务状态和优先级。',
        },
        announcements: {
          onDragStart: ({ active }) =>
            `已拾起任务：${active.data.current?.name}`,
          onDragOver: ({ over }) =>
            over ? `移动到${over.data.current?.label}` : '移出可放置区域',
          onDragEnd: ({ over }) =>
            over ? `已放到${over.data.current?.label}` : '未移动任务',
          onDragCancel: () => '已取消移动',
        },
      }}
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={({ active, over }) => {
        setActiveId(null);
        const target = groups.find((group) => group.id === over?.id);
        const task = tasks.find((item) => item.id === active.id);
        if (!target || !task || pendingIds.has(task.id)) return;
        if (
          mode === 'matrix'
            ? taskPriority(task) === target.id
            : taskStatus(task) === target.id
        )
          return;
        void onUpdate(task.id, target.changes);
      }}
    >
      <div
        className={cn(
          'grid items-stretch gap-4',
          mode === 'matrix' ? 'md:grid-cols-2' : 'lg:grid-cols-3',
        )}
      >
        {groups.map((group) => (
          <TaskDropZone
            key={group.id}
            {...group}
            count={group.items.length}
            creatingDisabled={creatingDisabled}
            onCreate={
              mode === 'board' && group.id === TASK_STATUS.DONE
                ? undefined
                : () => onCreate(group.changes as TaskCreationDefaults)
            }
          >
            {group.items.map((task) => (
              <DraggableTask
                key={task.id}
                task={task}
                onUpdate={onUpdate}
                pending={pendingIds.has(task.id)}
              />
            ))}
          </TaskDropZone>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="rounded-xl border bg-card p-4 text-sm text-card-foreground shadow-lg [overflow-wrap:anywhere]">
            {activeTask.name}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
