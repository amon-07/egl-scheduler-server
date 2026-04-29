import type { SchedulerQueue, SchedulerStore } from '../types';
export interface CancelDeps {
    store: SchedulerStore;
    queue: SchedulerQueue;
}
export declare function cancelJob(deps: CancelDeps, jobId: string): Promise<{
    status: 'ok';
    cancelled: boolean;
    jobId: string;
}>;
//# sourceMappingURL=cancel.d.ts.map