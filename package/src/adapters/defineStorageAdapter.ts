import type { SchedulerStore } from '../types';
import { assertStorageAdapter } from './validateStorageAdapter';

export function defineStorageAdapter(adapter: SchedulerStore): SchedulerStore {
  assertStorageAdapter(adapter);
  return adapter;
}
