import type { SchedulerStore } from '../types';
import { InvalidScheduleError } from '../utils/errors';

const REQUIRED_STORE_METHODS: Array<keyof SchedulerStore> = [
  'upsertScheduledJob',
  'markQueued',
  'markRunning',
  'markCompleted',
  'markFailed',
  'markDeadLetter',
  'markCancelled',
  'markExpired',
  'findReconcileCandidates',
  'getByJobId',
  'list',
];

export function assertStorageAdapter(adapter: unknown): asserts adapter is SchedulerStore {
  if (!adapter || typeof adapter !== 'object') {
    throw new InvalidScheduleError('Storage adapter must be an object.');
  }

  const missing = REQUIRED_STORE_METHODS.filter((method) => {
    return typeof (adapter as Partial<Record<keyof SchedulerStore, unknown>>)[method] !== 'function';
  });

  if (missing.length > 0) {
    throw new InvalidScheduleError(`Storage adapter is missing required method(s): ${missing.join(', ')}.`);
  }
}
