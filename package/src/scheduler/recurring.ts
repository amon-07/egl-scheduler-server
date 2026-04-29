import cronParser from 'cron-parser';
import type {
  JobOptions,
  ScheduleRecurringInput,
  ScheduleRecurringResult,
  SchedulerQueue,
  SchedulerStore,
} from '../types';
import type { JobRegistry } from '../registry/registry';
import { scheduleJob } from './schedule';

export const RECURRING_META_KEY = '__lazySchedulerRecurring';

export interface ScheduleRecurringDeps {
  registry: JobRegistry;
  store: SchedulerStore;
  queue: SchedulerQueue;
  defaults: JobOptions;
}

export async function scheduleRecurringJob(
  deps: ScheduleRecurringDeps,
  input: ScheduleRecurringInput
): Promise<ScheduleRecurringResult> {
  if (!input.pattern) throw new Error('recurring pattern is required');
  if (!input.jobId) throw new Error('recurring jobId is required');

  const nextRunAt = getNextCronRunAt(input.pattern, input.tz);
  const result = await scheduleJob(deps, {
    name: input.name,
    jobId: input.jobId,
    payload: {
      ...input.payload,
      [RECURRING_META_KEY]: {
        jobId: input.jobId,
        pattern: input.pattern,
        tz: input.tz,
        payload: input.payload,
      },
    },
    runAt: nextRunAt,
    ttlMs: input.ttlMs,
    attempts: input.attempts,
    backoff: input.backoff,
    replaceExisting: input.replaceExisting,
    createdBy: input.createdBy,
    metadata: input.metadata,
  });

  return {
    status: 'ok',
    action: result.action,
    jobId: input.jobId,
    name: input.name,
    pattern: input.pattern,
    tz: input.tz,
    nextRunAt: result.runAt,
    delayMs: result.delayMs,
  };
}

function getNextCronRunAt(pattern: string, tz?: string): string {
  return cronParser
    .parseExpression(pattern, {
      tz,
      currentDate: new Date(Date.now() + 1000),
    })
    .next()
    .toDate()
    .toISOString();
}
