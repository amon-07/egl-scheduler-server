import type { JobOptions, ScheduleJobInput, ScheduleJobResult, SchedulerQueue, SchedulerStore } from '../types';
import type { JobRegistry } from '../registry/registry';
export interface ScheduleDeps {
    registry: JobRegistry;
    store: SchedulerStore;
    queue: SchedulerQueue;
    defaults: JobOptions;
}
export declare function scheduleJob(deps: ScheduleDeps, input: ScheduleJobInput): Promise<ScheduleJobResult>;
//# sourceMappingURL=schedule.d.ts.map