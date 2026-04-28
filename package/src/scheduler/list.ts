import type { ListJobsFilter, SchedulerJobRecord, SchedulerStore } from '../types';

export function listJobs(store: SchedulerStore, filter?: ListJobsFilter): Promise<SchedulerJobRecord[]> {
  return store.list(filter);
}
