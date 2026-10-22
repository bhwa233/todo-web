'use client';
import { useState } from 'react';
import { getAiJobStatus, retryAiJob } from '@/api/ai/jobActions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
export function AiJobControl({
  targetId,
  disabled,
}: {
  targetId: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  async function check() {
    setBusy(true);
    try {
      const job = await getAiJobStatus(targetId);
      if (job?.status === 'FAILED') {
        const retried = await retryAiJob(job.id);
        toast({
          title: retried ? '已重新提交 AI 处理' : '任务状态已变化，请稍后查看',
        });
      } else {
        const labels: Record<string, string> = {
          PENDING: 'AI 处理中',
          PUBLISHED: 'AI 处理中',
          RUNNING: 'AI 处理中',
          DONE: 'AI 处理已完成',
          SUPERSEDED: '内容已修改，旧 AI 请求已取消',
        };
        toast({
          title: job
            ? (labels[job.status] ?? '稍后再查看')
            : '没有待处理的 AI 请求',
        });
      }
    } catch {
      toast({ title: '暂时无法获取 AI 状态', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || busy}
      onClick={() => void check()}
    >
      AI 状态／重试
    </Button>
  );
}
