import type { SchedulerQueue } from '../types';
export interface BullMqQueueConfig {
    queueName: string;
    redisConnection: unknown;
}
export declare function createBullMqQueue(config: BullMqQueueConfig): SchedulerQueue;
//# sourceMappingURL=bullmqQueue.d.ts.map