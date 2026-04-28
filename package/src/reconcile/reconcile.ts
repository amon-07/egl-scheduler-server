import type {
  JobOptions,
  ReconcileResult,
  SchedulerLogger,
  SchedulerQueue,
  SchedulerStore,
} from '../types';
import type { RedisLockManager } from '../utils/redisLock';
import { isExpired } from '../utils/time';

export interface ReconcileDeps {
  store: SchedulerStore;
  queue: SchedulerQueue;
  lock: RedisLockManager;
  defaults: JobOptions & { staleRunningAfterMs?: number; reconcileBatchSize?: number };
  logger: SchedulerLogger;
}

export async function reconcileJobs(deps: ReconcileDeps): Promise<ReconcileResult> {
  const lock = await deps.lock.acquire('reconcile');
  if (!lock) {
    deps.logger.info('lazy-scheduler:reconcile', 'Skipped reconciliation because another instance owns the lock');
    return {
      checked: 0,
      enqueued: 0,
      expired: 0,
      staleRetried: 0,
      skipped: 0,
      lockAcquired: false,
    };
  }

  const staleRunningAfterMs = deps.defaults.staleRunningAfterMs ?? 10 * 60 * 1000;
  const batchSize = deps.defaults.reconcileBatchSize ?? 1000;

  try {
    const candidates = await deps.store.findReconcileCandidates(staleRunningAfterMs, batchSize);
    const result: ReconcileResult = {
      checked: candidates.length,
      enqueued: 0,
      expired: 0,
      staleRetried: 0,
      skipped: 0,
      lockAcquired: true,
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

      const queuedRecord = await deps.store.markQueued(record.jobId, queued.jobId);
      if (!queuedRecord) {
        result.skipped += 1;
        continue;
      }

      result.enqueued += 1;
    }

    deps.logger.info('lazy-scheduler:reconcile', 'Reconciliation complete', result);
    return result;
  } finally {
    await lock.release();
  }
}
