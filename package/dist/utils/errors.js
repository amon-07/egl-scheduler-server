"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidScheduleError = exports.DuplicateJobError = exports.UnknownJobError = exports.LazySchedulerError = void 0;
class LazySchedulerError extends Error {
    constructor(message) {
        super(message);
        this.name = new.target.name;
    }
}
exports.LazySchedulerError = LazySchedulerError;
class UnknownJobError extends LazySchedulerError {
    constructor(name) {
        super(`Unknown scheduler job type: "${name}"`);
    }
}
exports.UnknownJobError = UnknownJobError;
class DuplicateJobError extends LazySchedulerError {
    constructor(name) {
        super(`Scheduler job type is already registered: "${name}"`);
    }
}
exports.DuplicateJobError = DuplicateJobError;
class InvalidScheduleError extends LazySchedulerError {
    constructor(message) {
        super(message);
    }
}
exports.InvalidScheduleError = InvalidScheduleError;
//# sourceMappingURL=errors.js.map