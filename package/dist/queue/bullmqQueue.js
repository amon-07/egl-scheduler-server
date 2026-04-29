"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBullMqQueue = createBullMqQueue;
const bullmq_1 = require("bullmq");
const time_1 = require("../utils/time");
function createBullMqQueue(config) {
    const queue = new bullmq_1.Queue(config.queueName, {
        connection: config.redisConnection,
    });
    return {
        async enqueue(record, options) {
            const delay = (0, time_1.getDelayMs)(record.runAt);
            const bullJobId = buildBullJobId(record);
            const existing = await queue.getJob(bullJobId);
            if (existing) {
                const state = await existing.getState().catch(() => 'unknown');
                if (!['completed', 'failed'].includes(state)) {
                    return { jobId: String(existing.id), existing: true };
                }
                await existing.remove().catch(() => undefined);
            }
            const bullOptions = {
                jobId: bullJobId,
                delay,
                attempts: options.attempts ?? record.attempts,
                backoff: (options.backoff ?? record.backoff),
                removeOnComplete: options.removeOnComplete,
                removeOnFail: options.removeOnFail,
            };
            const job = await queue.add(record.name, {
                ...record.payload,
                _lazyScheduler: {
                    jobId: record.jobId,
                    version: record.version,
                    runAt: record.runAt.toISOString(),
                },
            }, bullOptions);
            return { jobId: String(job.id), existing: false };
        },
        async remove(jobId) {
            const job = await queue.getJob(jobId);
            if (!job)
                return false;
            await job.remove();
            return true;
        },
        get(jobId) {
            return queue.getJob(jobId);
        },
        close() {
            return queue.close();
        },
    };
}
function buildBullJobId(record) {
    return `ls-${toBullSafeId(record.jobId)}-v-${record.version}`;
}
function toBullSafeId(value) {
    return Buffer.from(value).toString('base64url');
}
//# sourceMappingURL=bullmqQueue.js.map