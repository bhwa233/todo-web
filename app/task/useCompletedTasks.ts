'use client';

import { useEffect, useRef, useState } from 'react';
import { useLatest, useMemoizedFn, useRequest } from 'ahooks';
import {
  fetchCompletedTaskPage,
  fetchCompletedTaskSummary,
  type Task,
} from '@/api/task/taskActions';
import {
  changeCompletedSummary,
  matchesCompletedTask,
  mergeCompletedTasks,
  type CompletedTaskCursor,
  type CompletedTaskQuery,
  type CompletedTaskSummary,
} from '@/api/task/completedTasks';

interface PageState {
  key: string;
  items: Task[];
  cursor: CompletedTaskCursor | null;
  initialized: boolean;
}

// useRequest supplies cancellation and latest-request handling. Keep only the
// task-specific accumulated pages here: useInfiniteScroll merges a captured old
// list, which could overwrite task edits or reopened tasks during an append.
export default function useCompletedTasks(
  query: CompletedTaskQuery,
  enabled: boolean,
  paused: boolean,
) {
  const key = JSON.stringify(query);
  const current = useLatest({ key, query, enabled, paused });
  const epoch = useRef(0);
  const pageLock = useRef(false);
  const [page, setPage] = useState<PageState>();
  const pageRef = useLatest(page);
  const [summary, setSummary] = useState<
    CompletedTaskSummary & { key: string }
  >();
  const [pageError, setPageError] = useState<string>();
  const [summaryError, setSummaryError] = useState<string>();

  const summaryRequest = useRequest(
    async (q: CompletedTaskQuery, requestKey: string, version: number) => ({
      ...(await fetchCompletedTaskSummary(q)),
      key: requestKey,
      version,
    }),
    {
      manual: true,
      debounceWait: 200,
      onSuccess: (result) => {
        if (
          result.key === current.current.key &&
          result.version === epoch.current
        ) {
          setSummary(result);
          setSummaryError(undefined);
        }
      },
      onError: (error, [, requestKey, version]) => {
        if (requestKey === current.current.key && version === epoch.current)
          setSummaryError(error.message);
      },
    },
  );
  const pageRequest = useRequest(
    async (
      q: CompletedTaskQuery,
      cursor: CompletedTaskCursor | null,
      requestKey: string,
      version: number,
    ) => ({
      ...(await fetchCompletedTaskPage(q, cursor)),
      key: requestKey,
      version,
    }),
    {
      manual: true,
      debounceWait: 200,
      onSuccess: (result, [, cursor]) => {
        if (
          result.key !== current.current.key ||
          result.version !== epoch.current
        )
          return;
        setPage((previous) => ({
          key: result.key,
          items: mergeCompletedTasks(
            cursor && previous?.key === result.key ? previous.items : [],
            result.items,
          ),
          cursor: result.nextCursor,
          initialized: true,
        }));
        setPageError(undefined);
      },
      onError: (error, [, , requestKey, version]) => {
        if (requestKey === current.current.key && version === epoch.current)
          setPageError(error.message);
      },
      onFinally: ([, , requestKey, version]) => {
        if (requestKey === current.current.key && version === epoch.current)
          pageLock.current = false;
      },
    },
  );

  const cancel = useMemoizedFn(() => {
    epoch.current += 1;
    pageLock.current = false;
    summaryRequest.cancel();
    pageRequest.cancel();
  });
  const loadMore = useMemoizedFn(() => {
    const context = current.current;
    if (context.paused || pageLock.current) return;
    const loaded =
      pageRef.current?.key === context.key ? pageRef.current : undefined;
    if (loaded?.initialized && !loaded.cursor) return;
    pageLock.current = true;
    setPageError(undefined);
    pageRequest.run(
      context.query,
      loaded?.cursor ?? null,
      context.key,
      epoch.current,
    );
  });
  const refreshSummary = useMemoizedFn(() => {
    const context = current.current;
    if (context.paused) return;
    setSummaryError(undefined);
    summaryRequest.run(context.query, context.key, epoch.current);
  });
  const refresh = useMemoizedFn(() => {
    cancel();
    setPage(undefined);
    setPageError(undefined);
    refreshSummary();
    const context = current.current;
    if (context.enabled && !context.paused) {
      pageLock.current = true;
      pageRequest.run(context.query, null, context.key, epoch.current);
    }
  });

  useEffect(() => {
    cancel();
    setPage(undefined);
    setSummary(undefined);
    setPageError(undefined);
    setSummaryError(undefined);
    return cancel;
  }, [key, cancel]);
  useEffect(() => {
    if (paused) {
      cancel();
      return;
    }
    refreshSummary();
  }, [key, paused, cancel, refreshSummary]);
  useEffect(() => {
    if (
      enabled &&
      !paused &&
      !(pageRef.current?.key === key && pageRef.current.initialized)
    )
      loadMore();
  }, [key, enabled, paused, loadMore, pageRef]);

  const applyChange = useMemoizedFn(
    (previous: Task | undefined, next: Task, adjustCounts = true) => {
      const context = current.current;
      setPage((old) => {
        const sameQuery = old?.key === context.key;
        const items = (sameQuery ? old.items : []).filter(
          (task) => task.id !== next.id,
        );
        return {
          key: context.key,
          items: mergeCompletedTasks(
            items,
            matchesCompletedTask(next, context.query) ? [next] : [],
          ),
          cursor: sameQuery ? old.cursor : null,
          initialized: sameQuery ? old.initialized : false,
        };
      });
      if (adjustCounts)
        setSummary((old) =>
          old?.key === context.key
            ? {
                ...old,
                ...changeCompletedSummary(old, previous, next, context.query),
              }
            : old,
        );
    },
  );

  const loaded = page?.key === key ? page : undefined;
  const counts = summary?.key === key ? summary : undefined;
  return {
    key,
    items: loaded?.items ?? [],
    total: counts?.total,
    matching: counts?.matching,
    initialized: loaded?.initialized ?? false,
    hasMore: !loaded?.initialized || loaded.cursor !== null,
    loading:
      pageRequest.loading ||
      (enabled && !loaded?.initialized && !pageError && !paused),
    error: pageError,
    summaryError,
    refresh,
    refreshSummary,
    loadMore,
    applyChange,
    cancel,
  };
}

export type CompletedTasksState = ReturnType<typeof useCompletedTasks>;
