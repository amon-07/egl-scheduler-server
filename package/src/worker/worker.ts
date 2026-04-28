import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import type { SchedulerLogger, SchedulerStore } from '../types';
import type { JobRegistry } from '../registry/registry';

export interface WorkerDeps {
  queueName: string;
  redisConnection: unknown;
  registry: JobRegistry;
  store: SchedulerStore;
  logger: SchedulerLogger;
  concurrency: number;
}

export interface LazyWorker {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createWorker(deps: WorkerDeps): LazyWorker {
  let worker: Worker | null = null;

  async function processJob(job: Job): Promise<unknown> {
    const meta = job.data?._lazyScheduler as { jobId?: string; runAt?: string } | undefined;
    const jobId = meta?.jobId ?? String(job.id);
    const registered = deps.registry.get(job.name);

    if (!registered) {
      throw new Error(`No handler registered for scheduler job "${job.name}"`);
    }

    const runningRecord = await deps.store.markRunning(jobId);
    if (!runningRecord) {
      throw new Error(`Scheduler record not found for job "${jobId}"`);
    }

    try {
      const { _lazyScheduler: _ignored, ...payload } = job.data ?? {};
      const result = await registered.handler(payload, {
        jobId,
        attempt: job.attemptsMade + 1,
        maxAttempts: Number(job.opts.attempts ?? runningRecord.attempts),
        runAt: runningRecord.runAt,
        record: runningRecord,
      });

      await deps.store.markCompleted(jobId);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const maxAttempts = Number(job.opts.attempts ?? runningRecord.attempts);
      const retryable = job.attemptsMade + 1 < maxAttempts;
      await deps.store.markFailed(jobId, err, retryable);
      throw err;
    }
  }

  return {
    async start() {
      if (worker) return;

      worker = new Worker(deps.queueName, processJob, {
        connection: deps.redisConnection as never,
        concurrency: deps.concurrency,
      });

      worker.on('failed', (job, error) => {
        deps.logger.error('lazy-scheduler:worker', 'Job failed', {
          jobId: String(job?.id ?? ''),
          name: job?.name ?? '',
          error: error.message,
        });
      });

      worker.on('error', (error) => {
        deps.logger.error('lazy-scheduler:worker', 'Worker error', { error: error.message });
      });
    },

    async stop() {
      if (!worker) return;
      await worker.close();
      worker = null;
    },
  };
}
