import type {
  JobOptions,
  ScheduleJobInput,
  ScheduleJobResult,
  SchedulerQueue,
  SchedulerStore,
} from '../types';
import type { JobRegistry } from '../registry/registry';
import { UnknownJobError } from '../utils/errors';
import { getDelayMs, normalizeRunAt } from '../utils/time';

export interface ScheduleDeps {
  registry: JobRegistry;
  store: SchedulerStore;
  queue: SchedulerQueue;
  defaults: JobOptions;
}

export async function scheduleJob(deps: ScheduleDeps, input: ScheduleJobInput): Promise<ScheduleJobResult> {
  const registered = deps.registry.get(input.name);
  if (!registered) throw new UnknownJobError(input.name);

  const runAt = normalizeRunAt(input.runAt);
  const options = {
    ...deps.defaults,
    ...registered.defaultOptions,
    attempts: input.attempts ?? registered.defaultOptions.attempts ?? deps.defaults.attempts,
    backoff: input.backoff ?? registered.defaultOptions.backoff ?? deps.defaults.backoff,
  };

  if (input.replaceExisting !== false) {
    await deps.queue.remove(input.jobId).catch(() => false);
  }

  const record = await deps.store.upsertScheduledJob({ ...input, runAt }, options);
  const queued = await deps.queue.enqueue(record, options);
  const queuedRecord = await deps.store.markQueued(record.jobId, queued.jobId);
  const delayMs = getDelayMs(runAt);

  return {
    status: 'ok',
    action: delayMs === 0 ? 'queued_immediately' : 'scheduled',
    jobId: record.jobId,
    name: record.name,
    runAt: runAt.toISOString(),
    delayMs,
    record: queuedRecord ?? record,
  };
}
