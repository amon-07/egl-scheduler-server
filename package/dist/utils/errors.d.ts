export declare class LazySchedulerError extends Error {
    constructor(message: string);
}
export declare class UnknownJobError extends LazySchedulerError {
    constructor(name: string);
}
export declare class DuplicateJobError extends LazySchedulerError {
    constructor(name: string);
}
export declare class InvalidScheduleError extends LazySchedulerError {
    constructor(message: string);
}
//# sourceMappingURL=errors.d.ts.map