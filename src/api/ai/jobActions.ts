'use server';
import { requireAdmin } from '../../lib/auth';
import { callDataService } from '../../data/client';
export async function getAiJobStatus(targetId: string) {
  await requireAdmin();
  return callDataService<{
    id: string;
    status: string;
    error: string | null;
  } | null>('ai/status', { targetId });
}
export async function retryAiJob(id: string) {
  await requireAdmin();
  return callDataService<{ id: string } | null>('ai/retry', { id });
}
