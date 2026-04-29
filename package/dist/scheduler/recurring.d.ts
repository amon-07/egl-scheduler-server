import type { JobOptions, ScheduleRecurringInput, ScheduleRecurringResult, SchedulerQueue, SchedulerStore } from '../types';
import type { JobRegistry } from '../registry/registry';
export declare const RECURRING_META_KEY = "__lazySchedulerRecurring";
export interface ScheduleRecurringDeps {
    registry: JobRegistry;
    store: SchedulerStore;
    queue: SchedulerQueue;
    defaults: JobOptions;
}
export declare function scheduleRecurringJob(deps: ScheduleRecurringDeps, input: ScheduleRecurringInput): Promise<ScheduleRecurringResult>;
//# sourceMappingURL=recurring.d.ts.map