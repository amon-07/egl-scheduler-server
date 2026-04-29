import type { SchedulerLogger, SchedulerStore } from '../types';
import type { JobRegistry } from '../registry/registry';
export interface WorkerDeps {
    queueName: string;
    redisConnection: unknown;
    registry: JobRegistry;
    store: SchedulerStore;
    logger: SchedulerLogger;
    concurrency: number;
    deadLetterOnExhausted: boolean;
}
export interface LazyWorker {
    start(): Promise<void>;
    stop(): Promise<void>;
}
export declare function createWorker(deps: WorkerDeps): LazyWorker;
//# sourceMappingURL=worker.d.ts.map