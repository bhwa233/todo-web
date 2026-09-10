'use client';

import { useEffect, useRef } from 'react';
import { useInViewport } from 'ahooks';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CompletedTasksState } from '../useCompletedTasks';

function CompletedPageSentinel({ loadMore }: { loadMore: () => void }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [visible] = useInViewport(sentinel);
  useEffect(() => {
    if (visible) loadMore();
  }, [visible, loadMore]);
  return <div ref={sentinel} className="h-px w-full" aria-hidden="true" />;
}

export default function CompletedTaskLoader({
  completed,
  automatic = true,
  disabled = false,
}: {
  completed: CompletedTasksState;
  automatic?: boolean;
  disabled?: boolean;
}) {
  const { loading, hasMore, error, initialized, loadMore, items, matching } =
    completed;
  return (
    <div
      className="flex flex-col items-center gap-2 px-2 py-4"
      aria-live="polite"
    >
      <p className="text-xs text-muted-foreground">
        已完成 {matching ?? '…'} · 已加载 {items.length}
      </p>
      {loading ? (
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          正在加载…
        </span>
      ) : error ? (
        <>
          <p role="alert" className="text-xs text-destructive">
            已完成任务加载失败，已显示的任务会保留。
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={loadMore}
          >
            重试加载
          </Button>
        </>
      ) : hasMore ? (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={loadMore}
        >
          加载更多已完成任务
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">已全部加载</p>
      )}
      {/* Observe only after the current page is laid out. Reusing visibility
          from the loading placeholder can immediately fetch an extra page. */}
      {automatic && initialized && hasMore && !loading && !error && !disabled && (
        <CompletedPageSentinel key={items.length} loadMore={loadMore} />
      )}
    </div>
  );
}
