import type {
  JobOptions,
  ListJobsFilter,
  ScheduleJobInput,
  SchedulerJobRecord,
  SchedulerJobStatus,
  SchedulerStore,
} from '../types';
import { normalizeRunAt } from '../utils/time';

type MongoLike = {
  Schema: new (definition: Record<string, unknown>, options?: Record<string, unknown>) => unknown;
  models: Record<string, unknown>;
  model: (name: string, schema: unknown, collection?: string) => ModelLike;
};

type ModelLike = {
  findOneAndUpdate: (...args: unknown[]) => { lean: () => Promise<SchedulerJobRecord | null> };
  findOne: (...args: unknown[]) => { lean: () => Promise<SchedulerJobRecord | null> };
  find: (...args: unknown[]) => { sort: (sort: Record<string, 1 | -1>) => { limit: (limit: number) => { lean: () => Promise<SchedulerJobRecord[]> } } };
};

const MODEL_NAME = 'LazySchedulerJob';
const COLLECTION_NAME = 'scheduler_jobs';
const ACTIVE_STATUSES = ['pending', 'queued', 'failed_retryable'] as const;
const TERMINAL_STATUSES = ['completed', 'failed', 'dead_letter', 'cancelled', 'expired'] as const;

export function createMongoStore(mongoose: unknown): SchedulerStore {
  const model = createSchedulerJobModel(mongoose as MongoLike);

  return {
    async upsertScheduledJob(input: ScheduleJobInput, options: JobOptions) {
      const runAt = normalizeRunAt(input.runAt);
      const attempts = input.attempts ?? options.attempts ?? 3;
      const version = Date.now();

      const record = await model.findOneAndUpdate(
        { jobId: input.jobId },
        {
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
        },
        { new: true, upsert: true, lean: true }
      ).lean();

      return record as SchedulerJobRecord;
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
      const query: Record<string, unknown> = {};
      if (filter?.name) query.name = filter.name;
      if (filter?.status) {
        query.status = Array.isArray(filter.status) ? { $in: filter.status } : filter.status;
      }

      return model.find(query).sort({ runAt: 1 }).limit(filter?.limit ?? 100).lean();
    },
  };
}

function createSchedulerJobModel(mongoose: MongoLike): ModelLike {
  if (mongoose.models[MODEL_NAME]) {
    return mongoose.models[MODEL_NAME] as ModelLike;
  }

  const schema = new mongoose.Schema(
    {
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
    },
    {
      timestamps: true,
      strict: true,
    }
  );

  const schemaWithIndexes = schema as { index?: (fields: Record<string, unknown>) => void };
  schemaWithIndexes.index?.({ status: 1, runAt: 1 });
  schemaWithIndexes.index?.({ name: 1, status: 1 });

  return mongoose.model(MODEL_NAME, schema, COLLECTION_NAME);
}

function updateStatus(
  model: ModelLike,
  filter: Record<string, unknown>,
  status: SchedulerJobStatus,
  set: Record<string, unknown> = {}
): Promise<SchedulerJobRecord | null> {
  const inc = set.$inc;
  const { $inc: _unused, ...setFields } = set;

  return model.findOneAndUpdate(
    filter,
    {
      $set: { ...setFields, status },
      ...(inc ? { $inc: inc } : {}),
    },
    { new: true, lean: true }
  ).lean();
}
