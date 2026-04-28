import type { RegisterJobInput, RegisteredJob } from '../types';
import { DuplicateJobError, InvalidScheduleError } from '../utils/errors';

export interface JobRegistry {
  register(input: RegisterJobInput): void;
  get(name: string): RegisteredJob | undefined;
  has(name: string): boolean;
  list(): string[];
}

export function createRegistry(): JobRegistry {
  const handlers = new Map<string, RegisteredJob>();

  return {
    register(input) {
      if (!input.name || typeof input.name !== 'string') {
        throw new InvalidScheduleError('Job registration requires a non-empty name.');
      }

      if (typeof input.handler !== 'function') {
        throw new InvalidScheduleError(`Job "${input.name}" requires a handler function.`);
      }

      if (handlers.has(input.name)) {
        throw new DuplicateJobError(input.name);
      }

      handlers.set(input.name, {
        name: input.name,
        handler: input.handler,
        defaultOptions: input.defaultOptions ?? {},
      });
    },

    get(name) {
      return handlers.get(name);
    },

    has(name) {
      return handlers.has(name);
    },

    list() {
      return [...handlers.keys()];
    },
  };
}
