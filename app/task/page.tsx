'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLatest, useLocalStorageState } from 'ahooks';
import {
  ArrowDown,
  ArrowUp,
  CheckCheck,
  Columns3,
  Grid2X2,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  Table2,
  X,
} from 'lucide-react';
import {
  fetchActiveTasks,
  updateTask,
  type Task,
} from '@/api/task/taskActions';
import { fetchTaskTags } from '@/api/task/tagActions';
import useLocalStorageRequest from '@/hooks/useLocalStorageRequest';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, startConfettiAnimation } from '@/lib/utils';
import TaskComposer from './components/TaskComposer';
import TaskTagManager from './components/TaskTagManager';
import { ToastAction } from '@/components/ui/toast';
import TaskViews from './components/TaskViews';
import { normalizeTaskTagNames } from '@/api/task/taskTagNames';
import useCompletedTasks from './useCompletedTasks';
import {
  selectTasks,
  statuses,
  statusConfig,
  TASK_STATUS,
  type TaskChanges,
  type TaskCreationDefaults,
  type TaskFilters,
  type TaskSort,
  type TaskView,
} from './task-model';

const views = [
  {
    value: 'cards',
    label: '卡片',
    icon: LayoutGrid,
    description: '按优先级归类，留意每件重要的事。',
  },
  {
    value: 'list',
    label: '列表',
    icon: List,
    description: '一行一件事，专注完成手头的任务。',
  },
  {
    value: 'table',
    label: '表格',
    icon: Table2,
    description: '集中整理任务，点击列头调整排序。',
  },
  {
    value: 'matrix',
    label: '四象限',
    icon: Grid2X2,
    description: '拖动手柄调整优先级，分清重要与紧急。',
  },
  {
    value: 'board',
    label: '看板',
    icon: Columns3,
    description: '拖动手柄改变状态，让进展一目了然。',
  },
] as const;
const sortOptions: { value: TaskSort; label: string }[] = [
  { value: 'priority', label: '优先级' },
  { value: 'createTime', label: '创建时间' },
  { value: 'name', label: '任务名称' },
  { value: 'status', label: '任务状态' },
];
const defaultFilters: TaskFilters = {
  search: '',
  tag: 'all',
  status: 'all',
  sort: 'priority',
  descending: true,
};
const emptyTasks: Task[] = [];

function TaskLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 p-4 sm:p-6"
      role="status"
      aria-label="正在加载任务"
    >
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export default function Page() {
  // Both task cache and view preference use browser storage. Mount together to
  // avoid server/client markup differences from an existing local cache.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <TaskWorkspace /> : <TaskLoading />;
}

function TaskWorkspace() {
  const {
    data: activeTasks = emptyTasks,
    mutate: mutateActive,
    loading,
    error,
    refresh,
  } = useLocalStorageRequest(fetchActiveTasks, {
    cacheKey: 'ActiveTaskItems.v1',
  });
  const {
    data: tags = [],
    mutate: mutateTags,
    refresh: refreshTags,
  } = useLocalStorageRequest(fetchTaskTags, { cacheKey: 'TaskTags' });
  const [storedView, setStoredView] = useLocalStorageState<string>(
    'task.view.v1',
    { defaultValue: 'cards' },
  );
  const view: TaskView =
    views.find((item) => item.value === storedView)?.value ?? 'cards';
  const [filters, setFilters] = useState<TaskFilters>(defaultFilters);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const completedEnabled =
    (view === 'table' || view === 'board' || completedOpen) &&
    (filters.status === 'all' || filters.status === TASK_STATUS.DONE);
  const completed = useCompletedTasks(
    { search: filters.search.trim(), tag: filters.tag, status: filters.status },
    completedEnabled,
    pendingIds.size > 0,
  );
  const completedKey = useLatest(completed.key);
  const tasks = useMemo(
    () => [...activeTasks, ...completed.items],
    [activeTasks, completed.items],
  );
  const matchingActive = selectTasks(activeTasks, filters).length;
  const matchingTotal = matchingActive + (completed.matching ?? 0);
  useEffect(
    () => setCompletedOpen(filters.status === TASK_STATUS.DONE),
    [filters.status],
  );
  function applyTaskChange(
    previous: Task | undefined,
    next: Task,
    adjustCounts = true,
  ) {
    mutateActive((current) => {
      const remaining = (current ?? []).filter((task) => task.id !== next.id);
      return next.status === TASK_STATUS.DONE || next.deletedAt
        ? remaining
        : [next, ...remaining];
    });
    completed.applyChange(previous, next, adjustCounts);
  }

  const [creationDefaults, setCreationDefaults] =
    useState<TaskCreationDefaults | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const creationTrigger = useRef<HTMLElement | null>(null);
  const globalCreateButton = useRef<HTMLButtonElement | null>(null);
  function openComposer(defaults: TaskCreationDefaults = {}) {
    creationTrigger.current = document.activeElement as HTMLElement | null;
    setCreationDefaults(defaults);
  }
  function openEditor(task: Task) {
    creationTrigger.current = document.activeElement as HTMLElement | null;
    setEditingTask(task);
  }
  function rememberTags(task: Task) {
    mutateTags((current) => [
      ...new Map(
        [...(current ?? []), ...task.tags].map((tag) => [tag.id, tag]),
      ).values(),
    ]);
  }
  function clearFilters() {
    setFilters((current) => ({
      ...current,
      search: '',
      tag: 'all',
      status: 'all',
    }));
  }
  function taskCreated(task: Task) {
    rememberTags(task);
    if (task.status === TASK_STATUS.DONE) completed.cancel();
    applyTaskChange(undefined, task);
    completed.refreshSummary();
    if (
      task.status === TASK_STATUS.DONE &&
      completedEnabled &&
      !completed.initialized
    )
      completed.loadMore();
    const hidden = selectTasks([task], filters).length === 0;
    toast({
      title: '任务已添加',
      description: hidden
        ? '当前筛选下不可见。'
        : task.status === TASK_STATUS.DONE
          ? '已添加到已完成区域。'
          : undefined,
      action: hidden ? (
        <ToastAction altText="清除筛选以查看新任务" onClick={clearFilters}>
          清除筛选
        </ToastAction>
      ) : undefined,
    });
  }
  const updateLocks = useRef(new Set<string>());
  const { toast } = useToast();
  const visibleTasks = useMemo(
    () => selectTasks(tasks, filters),
    [tasks, filters],
  );
  const visibleTags = useMemo(() => {
    const known = new Map(tags.map((tag) => [tag.id, tag]));
    for (const task of tasks)
      for (const tag of task.tags) if (!tag.deletedAt) known.set(tag.id, tag);
    return [...known.values()];
  }, [tasks, tags]);
  const hasFilters =
    filters.search !== '' || filters.tag !== 'all' || filters.status !== 'all';
  const blockedIds = useMemo(
    () => (loading ? new Set(tasks.map((task) => task.id)) : pendingIds),
    [loading, tasks, pendingIds],
  );

  async function saveTask(id: string, changes: TaskChanges): Promise<boolean> {
    const previous = tasks.find((task) => task.id === id);
    if (!previous || loading || updateLocks.current.has(id)) return false;
    updateLocks.current.add(id);
    setPendingIds(new Set(updateLocks.current));
    const requestKey = completed.key;
    completed.cancel();
    const { tagNames, ...fields } = changes;
    const now = new Date();
    const optimistic: Task = {
      ...previous,
      ...fields,
      updateTime: now,
      tags:
        tagNames === undefined
          ? previous.tags
          : normalizeTaskTagNames(tagNames).map((name) => {
              const existing = visibleTags.find(
                (tag) =>
                  tag.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
              );
              return existing
                ? { ...existing, deletedAt: null }
                : {
                    id: `draft:${name}`,
                    name,
                    remark: null,
                    createTime: now,
                    updateTime: now,
                    deletedAt: null,
                  };
            }),
    };
    applyTaskChange(previous, optimistic);
    try {
      const saved = await updateTask(id, fields, tagNames);
      rememberTags(saved);
      applyTaskChange(optimistic, saved, requestKey === completedKey.current);
      if (
        changes.status === TASK_STATUS.DONE &&
        previous.status !== TASK_STATUS.DONE &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        startConfettiAnimation();
      return true;
    } catch {
      // Roll back only this task, preserving concurrent updates to other tasks.
      applyTaskChange(
        optimistic,
        previous,
        requestKey === completedKey.current,
      );
      toast({
        title: '保存失败',
        description: '已恢复原内容，请重试。',
        variant: 'destructive',
      });
      return false;
    } finally {
      updateLocks.current.delete(id);
      setPendingIds(new Set(updateLocks.current));
    }
  }
  function sortBy(sort: TaskSort) {
    setFilters((current) => ({
      ...current,
      sort,
      descending:
        current.sort === sort
          ? !current.descending
          : sort === 'priority' || sort === 'createTime',
    }));
  }
  function refreshAll() {
    refresh();
    refreshTags();
    completed.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 p-3 sm:gap-6 sm:p-6">
      <Tabs
        value={view}
        onValueChange={(value) => setStoredView(value)}
        className="flex min-w-0 flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList
            aria-label="任务展示模式"
            className="grid h-auto w-full grid-cols-5 sm:inline-flex sm:w-auto"
          >
            {views.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex-col gap-1 px-2 py-2 sm:flex-row sm:gap-1.5 sm:px-3"
              >
                <Icon className="size-4" />
                <span>{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex flex-wrap flex-1 items-center justify-end gap-2">
            <p className="text-xs text-muted-foreground">
              {views.find((item) => item.value === view)?.description}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshAll}
              disabled={loading || pendingIds.size > 0}
              aria-label="刷新任务"
            >
              <RefreshCw className={cn(loading && 'animate-spin')} />
              刷新
            </Button>
            <Button
              ref={globalCreateButton}
              size="sm"
              disabled={loading}
              onClick={() => openComposer()}
            >
              <Plus />
              新增任务
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input
              aria-label="搜索任务"
              placeholder="搜索任务、备注或标签…"
              value={filters.search}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              className="pl-9"
            />
          </div>
          <Select
            value={filters.tag}
            onValueChange={(tag) =>
              setFilters((current) => ({ ...current, tag }))
            }
          >
            <SelectTrigger aria-label="按标签筛选" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">全部标签</SelectItem>
                <SelectItem value="untagged">无标签</SelectItem>
                {visibleTags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <TaskTagManager
            tags={visibleTags}
            onTagCreated={(tag) =>
              mutateTags((current) => [tag, ...(current ?? [])])
            }
            onTagDeleted={(id) => {
              mutateTags((current) =>
                (current ?? []).filter((tag) => tag.id !== id),
              );
              mutateActive((current) =>
                (current ?? []).map((task) => ({
                  ...task,
                  tags: task.tags.filter((tag) => tag.id !== id),
                })),
              );
              completed.refresh();
              if (filters.tag === id)
                setFilters((current) => ({ ...current, tag: 'all' }));
            }}
          />
          <Select
            value={filters.status}
            onValueChange={(status) =>
              setFilters((current) => ({ ...current, status }))
            }
          >
            <SelectTrigger aria-label="按状态筛选" className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">全部状态</SelectItem>
                {statuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {statusConfig[status].label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={filters.sort}
            onValueChange={(sort) =>
              setFilters((current) => ({
                ...current,
                sort: sort as TaskSort,
                descending: sort === 'priority' || sort === 'createTime',
              }))
            }
          >
            <SelectTrigger aria-label="排序依据" className="w-[126px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {sortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            aria-label={
              filters.descending
                ? '当前降序，切换为升序'
                : '当前升序，切换为降序'
            }
            onClick={() =>
              setFilters((current) => ({
                ...current,
                descending: !current.descending,
              }))
            }
          >
            {filters.descending ? <ArrowDown /> : <ArrowUp />}
          </Button>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  search: '',
                  tag: 'all',
                  status: 'all',
                }))
              }
            >
              <X />
              清除筛选
            </Button>
          )}
        </div>
        <div
          className="flex items-center justify-between text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <span>
            显示 {visibleTasks.length} /{' '}
            {completed.total === undefined
              ? '…'
              : activeTasks.length + completed.total}{' '}
            项任务
          </span>
          {pendingIds.size > 0 && <span>正在保存…</span>}
        </div>
        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 text-sm text-destructive"
          >
            任务加载失败
            {tasks.length > 0 ? '，当前显示缓存内容。' : '，请重试。'}
            <Button
              variant="outline"
              size="sm"
              onClick={refreshAll}
              disabled={loading || pendingIds.size > 0}
            >
              重试
            </Button>
          </div>
        )}
        {completed.summaryError && (
          <div
            role="alert"
            className="flex items-center gap-2 text-sm text-destructive"
          >
            已完成任务数量加载失败。
            <Button
              size="sm"
              variant="outline"
              onClick={completed.refreshSummary}
              disabled={pendingIds.size > 0}
            >
              重试统计
            </Button>
          </div>
        )}
        {views.map((item) => (
          <TabsContent key={item.value} value={item.value} className="mt-0">
            {view === item.value &&
              (loading && !tasks.length ? (
                <Skeleton className="h-64 w-full rounded-xl" />
              ) : (
                <>
                  {!matchingTotal && completed.matching !== undefined && (
                    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-10 text-center">
                      <CheckCheck className="size-8 text-muted-foreground" />
                      <p className="text-sm font-medium">
                        {error
                          ? '暂时无法获取任务'
                          : hasFilters
                            ? '没有匹配的任务'
                            : '从一件小事开始'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {error
                          ? '点击重试，重新连接。'
                          : hasFilters
                            ? '试试其他关键词，或清除筛选条件。'
                            : '点击新增任务，记下接下来要做的事。'}
                      </p>
                    </div>
                  )}
                  {(matchingTotal > 0 ||
                    completed.matching === undefined ||
                    view === 'matrix' ||
                    view === 'board') && (
                    <TaskViews
                      tasks={visibleTasks}
                      view={view}
                      filters={filters}
                      onSort={sortBy}
                      onUpdate={saveTask}
                      onEdit={openEditor}
                      pendingIds={blockedIds}
                      onCreate={openComposer}
                      creatingDisabled={loading}
                      completed={completed}
                      completedOpen={completedOpen}
                      onCompletedOpenChange={setCompletedOpen}
                    />
                  )}
                </>
              ))}
          </TabsContent>
        ))}
      </Tabs>
      {(creationDefaults !== null || editingTask !== null) && (
        <TaskComposer
          key={editingTask?.id ?? 'new'}
          task={editingTask ?? undefined}
          tags={visibleTags}
          onSave={saveTask}
          defaults={creationDefaults ?? {}}
          disabled={loading}
          onCreated={taskCreated}
          onClose={() => {
            setCreationDefaults(null);
            setEditingTask(null);
          }}
          onRestoreFocus={() => {
            const target = creationTrigger.current;
            if (target?.isConnected) target.focus();
            else globalCreateButton.current?.focus();
          }}
        />
      )}
    </div>
  );
}
