import os from 'node:os';
import type { LazyScheduler, LazySchedulerConfig, SchedulerDefaults } from './types';
import { createRegistry } from './registry/registry';
import { scheduleJob } from './scheduler/schedule';
import { cancelJob } from './scheduler/cancel';
import { getJob } from './scheduler/get';
import { listJobs } from './scheduler/list';
import { createWorker } from './worker/worker';
import { reconcileJobs } from './reconcile/reconcile';
import { createBullMqQueue } from './queue/bullmqQueue';
import { createLogger } from './utils/logger';
import { createRedisLock } from './utils/redisLock';
import { InvalidScheduleError } from './utils/errors';
import { createMongoAdapter } from './adapters/mongoAdapter';
import { assertStorageAdapter } from './adapters/validateStorageAdapter';

const DEFAULTS: Required<Pick<
  SchedulerDefaults,
  'attempts' | 'staleRunningAfterMs' | 'deadLetterOnExhausted' | 'reconcileBatchSize'
>> & SchedulerDefaults = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 3000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 1000 },
  staleRunningAfterMs: 10 * 60 * 1000,
  deadLetterOnExhausted: true,
  reconcileBatchSize: 1000,
};

export function createScheduler(config: LazySchedulerConfig): LazyScheduler {
  const logger = createLogger(config.logger);
  const defaults = { ...DEFAULTS, ...config.defaults };
  const registry = createRegistry();
  const store = resolveStorageAdapter(config);
  const queue = createBullMqQueue({
    queueName: config.queueName,
    redisConnection: config.redisConnection,
  });
  const lock = createRedisLock({
    redisConnection: config.redisConnection,
    logger,
    enabled: config.locks?.enabled,
    keyPrefix: config.locks?.keyPrefix ?? config.queueName,
    ttlMs: config.locks?.ttlMs,
    instanceId: config.locks?.instanceId,
  });
  const worker = createWorker({
    queueName: config.queueName,
    redisConnection: config.redisConnection,
    registry,
    store,
    logger,
    concurrency: resolveWorkerConcurrency(config.worker?.concurrency),
    deadLetterOnExhausted: defaults.deadLetterOnExhausted,
  });

  return {
    register: registry.register,

    async start() {
      await worker.start();
    },

    reconcile() {
      return reconcileJobs({ store, queue, lock, defaults, logger });
    },

    schedule(input) {
      return scheduleJob({ registry, store, queue, defaults }, input);
    },

    cancel(jobId) {
      return cancelJob({ store, queue }, jobId);
    },

    get(jobId) {
      return getJob(store, jobId);
    },

    list(filter) {
      return listJobs(store, filter);
    },

    listDeadLetters(filter) {
      return listJobs(store, { ...filter, status: 'dead_letter' });
    },

    async shutdown() {
      await worker.stop();
      await queue.close();
      await lock.close();
    },
  };
}

function resolveStorageAdapter(config: LazySchedulerConfig) {
  if (config.store) {
    assertStorageAdapter(config.store);
    return config.store;
  }

  if (config.mongoose) {
    return createMongoAdapter({ mongoose: config.mongoose });
  }

  throw new InvalidScheduleError('createScheduler requires either config.store or config.mongoose.');
}

function resolveWorkerConcurrency(concurrency?: number | 'auto'): number {
  if (typeof concurrency === 'number' && Number.isFinite(concurrency) && concurrency > 0) {
    return Math.floor(concurrency);
  }

  const availableParallelism = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length;

  return Math.max(1, availableParallelism);
}
