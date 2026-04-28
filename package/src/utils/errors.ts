export class LazySchedulerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnknownJobError extends LazySchedulerError {
  constructor(name: string) {
    super(`Unknown scheduler job type: "${name}"`);
  }
}

export class DuplicateJobError extends LazySchedulerError {
  constructor(name: string) {
    super(`Scheduler job type is already registered: "${name}"`);
  }
}

export class InvalidScheduleError extends LazySchedulerError {
  constructor(message: string) {
    super(message);
  }
}
