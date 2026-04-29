"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleJob = scheduleJob;
const errors_1 = require("../utils/errors");
const time_1 = require("../utils/time");
async function scheduleJob(deps, input) {
    const registered = deps.registry.get(input.name);
    if (!registered)
        throw new errors_1.UnknownJobError(input.name);
    const runAt = (0, time_1.normalizeRunAt)(input.runAt);
    const options = {
        ...deps.defaults,
        ...registered.defaultOptions,
        attempts: input.attempts ?? registered.defaultOptions.attempts ?? deps.defaults.attempts,
        backoff: input.backoff ?? registered.defaultOptions.backoff ?? deps.defaults.backoff,
    };
    const existing = await deps.store.getByJobId(input.jobId);
    if (input.replaceExisting !== false) {
        if (existing?.bullJobId) {
            await deps.queue.remove(existing.bullJobId).catch(() => false);
        }
    }
    const record = await deps.store.upsertScheduledJob({ ...input, runAt }, options);
    const queued = await deps.queue.enqueue(record, options);
    const queuedRecord = await deps.store.markQueued(record.jobId, queued.jobId);
    const delayMs = (0, time_1.getDelayMs)(runAt);
    return {
        status: 'ok',
        action: delayMs === 0 ? 'queued_immediately' : existing ? 'rescheduled' : 'scheduled',
        jobId: record.jobId,
        name: record.name,
        runAt: runAt.toISOString(),
        delayMs,
        record: queuedRecord ?? record,
    };
}
//# sourceMappingURL=schedule.js.map