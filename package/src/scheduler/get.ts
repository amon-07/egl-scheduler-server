import type { SchedulerJobRecord, SchedulerStore } from '../types';

export function getJob(store: SchedulerStore, jobId: string): Promise<SchedulerJobRecord | null> {
  return store.getByJobId(jobId);
}
