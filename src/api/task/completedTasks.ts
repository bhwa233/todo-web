import type { Task } from './taskActions';

export { COMPLETED_PAGE_SIZE } from '../../data/commands';
export interface CompletedTaskQuery {
  search: string;
  tag: string;
  status: string;
}
export interface CompletedTaskCursor {
  updateTime: string;
  id: string;
}
export interface CompletedTaskSummary {
  total: number;
  matching: number;
}
export interface CompletedTaskPage {
  items: Task[];
  nextCursor: CompletedTaskCursor | null;
}

export function matchesCompletedTask(
  task: Task,
  query: CompletedTaskQuery,
): boolean {
  if (
    task.deletedAt ||
    task.status !== '1' ||
    (query.status !== 'all' && query.status !== '1')
  )
    return false;
  const tags = task.tags.filter((tag) => !tag.deletedAt);
  if (query.tag === 'untagged' && tags.length) return false;
  if (
    query.tag !== 'all' &&
    query.tag !== 'untagged' &&
    !tags.some((tag) => tag.id === query.tag)
  )
    return false;
  const search = query.search.trim().toLocaleLowerCase();
  return (
    !search ||
    [task.name, task.remark, ...tags.map((tag) => tag.name)].some((value) =>
      value.toLocaleLowerCase().includes(search),
    )
  );
}

export function mergeCompletedTasks(current: Task[], incoming: Task[]): Task[] {
  return [
    ...new Map(
      [...current, ...incoming].map((task) => [task.id, task]),
    ).values(),
  ].sort(
    (a, b) =>
      new Date(b.updateTime).getTime() - new Date(a.updateTime).getTime() ||
      b.id.localeCompare(a.id),
  );
}

export function changeCompletedSummary(
  summary: CompletedTaskSummary,
  previous: Task | undefined,
  next: Task,
  query: CompletedTaskQuery,
): CompletedTaskSummary {
  const wasDone = !!previous && !previous.deletedAt && previous.status === '1';
  const isDone = !next.deletedAt && next.status === '1';
  return {
    total: Math.max(0, summary.total + Number(isDone) - Number(wasDone)),
    matching: Math.max(
      0,
      summary.matching +
        Number(matchesCompletedTask(next, query)) -
        Number(!!previous && matchesCompletedTask(previous, query)),
    ),
  };
}
