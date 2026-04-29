import type { JobOptions, ReconcileResult, SchedulerLogger, SchedulerQueue, SchedulerStore } from '../types';
import type { RedisLockManager } from '../utils/redisLock';
export interface ReconcileDeps {
    store: SchedulerStore;
    queue: SchedulerQueue;
    lock: RedisLockManager;
    defaults: JobOptions & {
        staleRunningAfterMs?: number;
        reconcileBatchSize?: number;
    };
    logger: SchedulerLogger;
}
export declare function reconcileJobs(deps: ReconcileDeps): Promise<ReconcileResult>;
//# sourceMappingURL=reconcile.d.ts.map