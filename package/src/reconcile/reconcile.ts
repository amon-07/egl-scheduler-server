import type {
  JobOptions,
  ReconcileResult,
  SchedulerLogger,
  SchedulerQueue,
  SchedulerStore,
} from '../types';
import { isExpired } from '../utils/time';

export interface ReconcileDeps {
  store: SchedulerStore;
  queue: SchedulerQueue;
  defaults: JobOptions & { staleRunningAfterMs?: number };
  logger: SchedulerLogger;
}

export async function reconcileJobs(deps: ReconcileDeps): Promise<ReconcileResult> {
  const staleRunningAfterMs = deps.defaults.staleRunningAfterMs ?? 10 * 60 * 1000;
  const candidates = await deps.store.findReconcileCandidates(staleRunningAfterMs);
  const result: ReconcileResult = {
    checked: candidates.length,
    enqueued: 0,
    expired: 0,
    staleRetried: 0,
    skipped: 0,
  };

  for (const record of candidates) {
    if (isExpired(record.runAt, record.ttlMs)) {
      await deps.store.markExpired(record.jobId);
      result.expired += 1;
      continue;
    }

    if (record.status === 'running') {
      result.staleRetried += 1;
    }

    const queued = await deps.queue.enqueue(record, {
      ...deps.defaults,
      attempts: record.attempts,
      backoff: record.backoff ?? deps.defaults.backoff,
    });

    await deps.store.markQueued(record.jobId, queued.jobId);
    result.enqueued += 1;
  }

  deps.logger.info('lazy-scheduler:reconcile', 'Reconciliation complete', result);
  return result;
}
