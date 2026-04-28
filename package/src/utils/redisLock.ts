import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import type { SchedulerLogger } from '../types';

type RedisClientLike = {
  set: (...args: unknown[]) => Promise<unknown>;
  eval: (...args: unknown[]) => Promise<unknown>;
  quit?: () => Promise<unknown>;
};

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

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

export function createRedisLock(config: RedisLockConfig): RedisLockManager {
  const enabled = config.enabled !== false;
  const ownsClient = !isRedisClient(config.redisConnection);
  const client = enabled
    ? (isRedisClient(config.redisConnection)
      ? config.redisConnection
      : new Redis(config.redisConnection as RedisOptions))
    : null;
  const keyPrefix = config.keyPrefix ?? 'lazy-scheduler';
  const instanceId = config.instanceId ?? randomUUID();
  const defaultTtlMs = config.ttlMs ?? 30_000;

  return {
    async acquire(name, ttlMs = defaultTtlMs) {
      if (!enabled || !client) {
        return {
          key: `${keyPrefix}:lock:${name}`,
          token: 'locks-disabled',
          release: async () => undefined,
        };
      }

      const key = `${keyPrefix}:lock:${name}`;
      const token = `${instanceId}:${randomUUID()}`;
      const result = await client.set(key, token, 'PX', ttlMs, 'NX');

      if (result !== 'OK') return null;

      return {
        key,
        token,
        release: async () => {
          await client.eval(RELEASE_SCRIPT, 1, key, token).catch((error) => {
            config.logger.warn('lazy-scheduler:lock', 'Failed to release Redis lock', {
              key,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        },
      };
    },

    async close() {
      if (ownsClient && client?.quit) {
        await client.quit();
      }
    },
  };
}

function isRedisClient(value: unknown): value is RedisClientLike {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof (value as RedisClientLike).set === 'function'
    && typeof (value as RedisClientLike).eval === 'function'
  );
}
