"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECURRING_META_KEY = void 0;
exports.scheduleRecurringJob = scheduleRecurringJob;
const cron_parser_1 = __importDefault(require("cron-parser"));
const schedule_1 = require("./schedule");
exports.RECURRING_META_KEY = '__lazySchedulerRecurring';
async function scheduleRecurringJob(deps, input) {
    if (!input.pattern)
        throw new Error('recurring pattern is required');
    if (!input.jobId)
        throw new Error('recurring jobId is required');
    const nextRunAt = getNextCronRunAt(input.pattern, input.tz);
    const result = await (0, schedule_1.scheduleJob)(deps, {
        name: input.name,
        jobId: input.jobId,
        payload: {
            ...input.payload,
            [exports.RECURRING_META_KEY]: {
                jobId: input.jobId,
                pattern: input.pattern,
                tz: input.tz,
                payload: input.payload,
            },
        },
        runAt: nextRunAt,
        ttlMs: input.ttlMs,
        attempts: input.attempts,
        backoff: input.backoff,
        replaceExisting: input.replaceExisting,
        createdBy: input.createdBy,
        metadata: input.metadata,
    });
    return {
        status: 'ok',
        action: result.action,
        jobId: input.jobId,
        name: input.name,
        pattern: input.pattern,
        tz: input.tz,
        nextRunAt: result.runAt,
        delayMs: result.delayMs,
    };
}
function getNextCronRunAt(pattern, tz) {
    return cron_parser_1.default
        .parseExpression(pattern, {
        tz,
        currentDate: new Date(Date.now() + 1000),
    })
        .next()
        .toDate()
        .toISOString();
}
//# sourceMappingURL=recurring.js.map