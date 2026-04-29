"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createScheduler = createScheduler;
const node_os_1 = __importDefault(require("node:os"));
const registry_1 = require("./registry/registry");
const schedule_1 = require("./scheduler/schedule");
const recurring_1 = require("./scheduler/recurring");
const cancel_1 = require("./scheduler/cancel");
const get_1 = require("./scheduler/get");
const list_1 = require("./scheduler/list");
const worker_1 = require("./worker/worker");
const reconcile_1 = require("./reconcile/reconcile");
const bullmqQueue_1 = require("./queue/bullmqQueue");
const logger_1 = require("./utils/logger");
const redisLock_1 = require("./utils/redisLock");
const errors_1 = require("./utils/errors");
const mongoAdapter_1 = require("./adapters/mongoAdapter");
const validateStorageAdapter_1 = require("./adapters/validateStorageAdapter");
const DEFAULTS = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
    staleRunningAfterMs: 10 * 60 * 1000,
    deadLetterOnExhausted: true,
    reconcileBatchSize: 1000,
};
function createScheduler(config) {
    const logger = (0, logger_1.createLogger)(config.logger);
    const defaults = { ...DEFAULTS, ...config.defaults };
    const registry = (0, registry_1.createRegistry)();
    const store = resolveStorageAdapter(config);
    const queue = (0, bullmqQueue_1.createBullMqQueue)({
        queueName: config.queueName,
        redisConnection: config.redisConnection,
    });
    const lock = (0, redisLock_1.createRedisLock)({
        redisConnection: config.redisConnection,
        logger,
        enabled: config.locks?.enabled,
        keyPrefix: config.locks?.keyPrefix ?? config.queueName,
        ttlMs: config.locks?.ttlMs,
        instanceId: config.locks?.instanceId,
    });
    const worker = (0, worker_1.createWorker)({
        queueName: config.queueName,
        redisConnection: config.redisConnection,
        registry,
        store,
        logger,
        concurrency: resolveWorkerConcurrency(config.worker?.concurrency),
        deadLetterOnExhausted: defaults.deadLetterOnExhausted,
    });
    return {
        register(input) {
            registry.register({
                ...input,
                handler: async (payload, context) => {
                    const recurring = payload[recurring_1.RECURRING_META_KEY];
                    const { [recurring_1.RECURRING_META_KEY]: _ignored, ...handlerPayload } = payload;
                    const result = await input.handler(handlerPayload, context);
                    if (recurring?.jobId && recurring.pattern) {
                        (0, recurring_1.scheduleRecurringJob)({ registry, store, queue, defaults }, {
                            name: input.name,
                            jobId: recurring.jobId,
                            payload: recurring.payload ?? handlerPayload,
                            pattern: recurring.pattern,
                            tz: recurring.tz,
                        }).catch((error) => {
                            logger.error('lazy-scheduler:recurring', 'Failed to schedule next recurring run', {
                                jobName: input.name,
                                jobId: recurring.jobId,
                                error: error instanceof Error ? error.message : String(error),
                            });
                        });
                    }
                    return result;
                },
            });
        },
        listRegistered() {
            return registry.list();
        },
        async start() {
            await worker.start();
        },
        reconcile() {
            return (0, reconcile_1.reconcileJobs)({ store, queue, lock, defaults, logger });
        },
        schedule(input) {
            return (0, schedule_1.scheduleJob)({ registry, store, queue, defaults }, input);
        },
        scheduleRecurring(input) {
            return (0, recurring_1.scheduleRecurringJob)({ registry, store, queue, defaults }, input);
        },
        cancel(jobId) {
            return (0, cancel_1.cancelJob)({ store, queue }, jobId);
        },
        get(jobId) {
            return (0, get_1.getJob)(store, jobId);
        },
        list(filter) {
            return (0, list_1.listJobs)(store, filter);
        },
        listDeadLetters(filter) {
            return (0, list_1.listJobs)(store, { ...filter, status: 'dead_letter' });
        },
        async shutdown() {
            await worker.stop();
            await queue.close();
            await lock.close();
        },
    };
}
function resolveStorageAdapter(config) {
    if (config.store) {
        (0, validateStorageAdapter_1.assertStorageAdapter)(config.store);
        return config.store;
    }
    if (config.mongoose) {
        return (0, mongoAdapter_1.createMongoAdapter)({ mongoose: config.mongoose });
    }
    throw new errors_1.InvalidScheduleError('createScheduler requires either config.store or config.mongoose.');
}
function resolveWorkerConcurrency(concurrency) {
    if (typeof concurrency === 'number' && Number.isFinite(concurrency) && concurrency > 0) {
        return Math.floor(concurrency);
    }
    const availableParallelism = typeof node_os_1.default.availableParallelism === 'function'
        ? node_os_1.default.availableParallelism()
        : node_os_1.default.cpus().length;
    return Math.max(1, availableParallelism);
}
//# sourceMappingURL=createScheduler.js.map