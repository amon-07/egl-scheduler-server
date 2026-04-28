import type { SchedulerLogger } from '../types';

const noop = () => undefined;

export function createLogger(logger?: Partial<SchedulerLogger>): SchedulerLogger {
  return {
    debug: logger?.debug ?? noop,
    info: logger?.info ?? noop,
    warn: logger?.warn ?? noop,
    error: logger?.error ?? noop,
  };
}
