import type { LazyScheduler, LazySchedulerConfig, SchedulerDefaults } from './types';
import { createRegistry } from './registry/registry';
import { scheduleJob } from './scheduler/schedule';
import { cancelJob } from './scheduler/cancel';
import { getJob } from './scheduler/get';
import { listJobs } from './scheduler/list';
import { createWorker } from './worker/worker';
import { reconcileJobs } from './reconcile/reconcile';
import { createMongoStore } from './store/mongoStore';
import { createBullMqQueue } from './queue/bullmqQueue';
import { createLogger } from './utils/logger';

const DEFAULTS: Required<Pick<SchedulerDefaults, 'attempts' | 'staleRunningAfterMs'>> & SchedulerDefaults = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 3000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 1000 },
  staleRunningAfterMs: 10 * 60 * 1000,
};

export function createScheduler(config: LazySchedulerConfig): LazyScheduler {
  const logger = createLogger(config.logger);
  const defaults = { ...DEFAULTS, ...config.defaults };
  const registry = createRegistry();
  const store = createMongoStore(config.mongoose);
  const queue = createBullMqQueue({
    queueName: config.queueName,
    redisConnection: config.redisConnection,
  });
  const worker = createWorker({
    queueName: config.queueName,
    redisConnection: config.redisConnection,
    registry,
    store,
    logger,
    concurrency: config.worker?.concurrency ?? 5,
  });

  return {
    register: registry.register,

    async start() {
      await worker.start();
    },

    reconcile() {
      return reconcileJobs({ store, queue, defaults, logger });
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

    async shutdown() {
      await worker.stop();
      await queue.close();
    },
  };
}
