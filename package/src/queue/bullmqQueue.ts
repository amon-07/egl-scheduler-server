import { Queue } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import type { JobOptions, SchedulerJobRecord, SchedulerQueue } from '../types';
import { getDelayMs } from '../utils/time';

export interface BullMqQueueConfig {
  queueName: string;
  redisConnection: unknown;
}

export function createBullMqQueue(config: BullMqQueueConfig): SchedulerQueue {
  const queue = new Queue(config.queueName, {
    connection: config.redisConnection as never,
  });

  return {
    async enqueue(record: SchedulerJobRecord, options: JobOptions) {
      const delay = getDelayMs(record.runAt);
      const bullOptions: JobsOptions = {
        jobId: record.jobId,
        delay,
        attempts: options.attempts ?? record.attempts,
        backoff: (options.backoff ?? record.backoff) as JobsOptions['backoff'],
        removeOnComplete: options.removeOnComplete as JobsOptions['removeOnComplete'],
        removeOnFail: options.removeOnFail as JobsOptions['removeOnFail'],
      };

      const job = await queue.add(
        record.name,
        {
          ...record.payload,
          _lazyScheduler: {
            jobId: record.jobId,
            runAt: record.runAt.toISOString(),
          },
        },
        bullOptions
      );

      return { jobId: String(job.id) };
    },

    async remove(jobId) {
      const job = await queue.getJob(jobId);
      if (!job) return false;
      await job.remove();
      return true;
    },

    get(jobId) {
      return queue.getJob(jobId);
    },

    close() {
      return queue.close();
    },
  };
}
