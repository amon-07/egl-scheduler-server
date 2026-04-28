import type { SchedulerQueue, SchedulerStore } from '../types';

export interface CancelDeps {
  store: SchedulerStore;
  queue: SchedulerQueue;
}

export async function cancelJob(deps: CancelDeps, jobId: string): Promise<{ status: 'ok'; cancelled: boolean; jobId: string }> {
  const removed = await deps.queue.remove(jobId).catch(() => false);
  const record = await deps.store.markCancelled(jobId);

  return {
    status: 'ok',
    cancelled: Boolean(record || removed),
    jobId,
  };
}
