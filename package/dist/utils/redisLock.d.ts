import type { SchedulerLogger } from '../types';
export interface RedisLockConfig {
    redisConnection: unknown;
    logger: SchedulerLogger;
    enabled?: boolean;
    keyPrefix?: string;
    ttlMs?: number;
    instanceId?: string;
}
export interface AcquiredLock {
    key: string;
    token: string;
    release(): Promise<void>;
}
export interface RedisLockManager {
    acquire(name: string, ttlMs?: number): Promise<AcquiredLock | null>;
    close(): Promise<void>;
}
export declare function createRedisLock(config: RedisLockConfig): RedisLockManager;
//# sourceMappingURL=redisLock.d.ts.map