"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMongoStore = createMongoStore;
const time_1 = require("../utils/time");
const MODEL_NAME = 'LazySchedulerJob';
const COLLECTION_NAME = 'scheduler_jobs';
const ACTIVE_STATUSES = ['pending', 'queued', 'failed_retryable'];
const TERMINAL_STATUSES = ['completed', 'failed', 'dead_letter', 'cancelled', 'expired'];
function createMongoStore(mongoose) {
    const model = createSchedulerJobModel(mongoose);
    return {
        async upsertScheduledJob(input, options) {
            const runAt = (0, time_1.normalizeRunAt)(input.runAt);
            const attempts = input.attempts ?? options.attempts ?? 3;
            const version = Date.now();
            const record = await model.findOneAndUpdate({ jobId: input.jobId }, {
                $set: {
                    jobId: input.jobId,
                    version,
                    name: input.name,
                    payload: input.payload,
                    runAt,
                    ttlMs: input.ttlMs,
                    status: 'pending',
                    attempts,
                    backoff: input.backoff ?? options.backoff,
                    attemptsMade: 0,
                    createdBy: input.createdBy ?? null,
                    metadata: input.metadata ?? {},
                    lockedAt: null,
                    startedAt: null,
                    finishedAt: null,
                    deadLetterAt: null,
                    lastError: null,
                },
            }, { new: true, upsert: true, lean: true }).lean();
            return record;
        },
        markQueued(jobId, bullJobId) {
            return updateStatus(model, { jobId, status: { $nin: TERMINAL_STATUSES } }, 'queued', { bullJobId });
        },
        markRunning(jobId, version) {
            return updateStatus(model, {
                jobId,
                version,
                status: { $in: ACTIVE_STATUSES },
                $expr: { $lt: ['$attemptsMade', '$attempts'] },
            }, 'running', {
                lockedAt: new Date(),
                startedAt: new Date(),
                finishedAt: null,
                $inc: { attemptsMade: 1 },
            });
        },
        markCompleted(jobId, version) {
            return updateStatus(model, { jobId, version, status: 'running' }, 'completed', {
                lockedAt: null,
                finishedAt: new Date(),
            });
        },
        markFailed(jobId, version, error, retryable) {
            return updateStatus(model, { jobId, version, status: 'running' }, retryable ? 'failed_retryable' : 'failed', {
                lockedAt: null,
                finishedAt: new Date(),
                lastError: error.message,
            });
        },
        markDeadLetter(jobId, version, error) {
            return updateStatus(model, { jobId, version, status: 'running' }, 'dead_letter', {
                lockedAt: null,
                finishedAt: new Date(),
                deadLetterAt: new Date(),
                lastError: error.message,
            });
        },
        markCancelled(jobId) {
            return updateStatus(model, { jobId, status: { $nin: TERMINAL_STATUSES } }, 'cancelled', {
                lockedAt: null,
                finishedAt: new Date(),
            });
        },
        markExpired(jobId) {
            return updateStatus(model, { jobId, status: { $nin: TERMINAL_STATUSES } }, 'expired', {
                lockedAt: null,
                finishedAt: new Date(),
            });
        },
        async findReconcileCandidates(staleRunningAfterMs, limit) {
            const staleBefore = new Date(Date.now() - staleRunningAfterMs);
            return model.find({
                $or: [
                    { status: { $in: ['pending', 'queued', 'failed_retryable'] } },
                    { status: 'running', lockedAt: { $lte: staleBefore } },
                ],
            }).sort({ runAt: 1 }).limit(limit).lean();
        },
        getByJobId(jobId) {
            return model.findOne({ jobId }).lean();
        },
        list(filter) {
            const query = {};
            if (filter?.name)
                query.name = filter.name;
            if (filter?.status) {
                query.status = Array.isArray(filter.status) ? { $in: filter.status } : filter.status;
            }
            return model.find(query).sort({ runAt: 1 }).limit(filter?.limit ?? 100).lean();
        },
    };
}
function createSchedulerJobModel(mongoose) {
    if (mongoose.models[MODEL_NAME]) {
        return mongoose.models[MODEL_NAME];
    }
    const schema = new mongoose.Schema({
        jobId: { type: String, required: true, unique: true, index: true },
        name: { type: String, required: true, index: true },
        payload: { type: Object, default: {} },
        version: { type: Number, required: true, default: 0 },
        runAt: { type: Date, required: true, index: true },
        ttlMs: { type: Number },
        status: { type: String, required: true, index: true },
        attempts: { type: Number, required: true, default: 3 },
        attemptsMade: { type: Number, required: true, default: 0 },
        backoff: { type: Object },
        bullJobId: { type: String },
        lockedAt: { type: Date },
        startedAt: { type: Date },
        finishedAt: { type: Date },
        deadLetterAt: { type: Date },
        lastError: { type: String },
        createdBy: { type: String },
        metadata: { type: Object, default: {} },
    }, {
        timestamps: true,
        strict: true,
    });
    const schemaWithIndexes = schema;
    schemaWithIndexes.index?.({ status: 1, runAt: 1 });
    schemaWithIndexes.index?.({ name: 1, status: 1 });
    return mongoose.model(MODEL_NAME, schema, COLLECTION_NAME);
}
function updateStatus(model, filter, status, set = {}) {
    const inc = set.$inc;
    const { $inc: _unused, ...setFields } = set;
    return model.findOneAndUpdate(filter, {
        $set: { ...setFields, status },
        ...(inc ? { $inc: inc } : {}),
    }, { new: true, lean: true }).lean();
}
//# sourceMappingURL=mongoStore.js.map