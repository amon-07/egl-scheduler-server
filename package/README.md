# lazy-scheduler

Durable delayed-job scheduler for Node.js, built on BullMQ/Redis for execution and a pluggable persistence adapter for schedule state.

Status: alpha. APIs may change while the package is being integrated and hardened.

## Why

BullMQ is fast and production-proven, but Redis should not be the only source of truth for long-lived schedule intent. `lazy-scheduler` keeps durable job state in a storage adapter and uses BullMQ as the execution layer.

The default adapter is MongoDB, but the scheduler core can use any storage backend that implements the adapter contract.

## Core Ideas

- `register()` defines a job type and its handler.
- `schedule()` creates one durable job instance for a registered job type.
- `reconcile()` repairs storage/BullMQ drift on startup.
- BullMQ execution is at-least-once; handlers should be idempotent.
- Logical jobs are versioned so stale BullMQ deliveries cannot complete a newer schedule.

## Installation

```bash
npm install lazy-scheduler
```

Peer dependencies:

```bash
npm install bullmq ioredis mongoose
```

## Quick Start

```ts
import { createMongoAdapter, createScheduler } from 'lazy-scheduler';

const scheduler = createScheduler({
  queueName: 'scheduler',
  redisConnection,
  store: createMongoAdapter({ mongoose }),
  worker: { concurrency: 'auto' },
});

scheduler.register({
  name: 'send-email',
  handler: async ({ userId }) => {
    await emailService.sendWelcomeEmail(userId);
  },
  defaultOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
  },
});

await scheduler.start();
await scheduler.reconcile();

await scheduler.schedule({
  name: 'send-email',
  jobId: 'send-email-user-123',
  payload: { userId: '123' },
  runAt: new Date(Date.now() + 5000),
});
```

## Runtime Flow

```text
Client
  -> scheduler.schedule()
  -> storage adapter persists schedule state
  -> BullMQ delayed job is queued
  -> worker receives job
  -> storage adapter marks running/completed/failed
```

On startup:

```text
scheduler.reconcile()
  -> acquire Redis reconcile lock
  -> read pending/queued/retryable/stale-running jobs from storage
  -> expire TTL jobs
  -> recreate missing BullMQ jobs
```

## API

```ts
scheduler.register({ name, handler, defaultOptions });
scheduler.start();
scheduler.reconcile();
scheduler.schedule({ name, jobId, payload, runAt });
scheduler.cancel(jobId);
scheduler.get(jobId);
scheduler.list(filters);
scheduler.listDeadLetters(filters);
scheduler.shutdown();
```

## Registering Jobs

`name` is the unique job type. `jobId` is the unique scheduled instance.

```ts
scheduler.register({
  name: 'stage:status-check',
  handler: async ({ stageId }, context) => {
    return handleStageStatusCheck(stageId, context);
  },
});

await scheduler.schedule({
  name: 'stage:status-check',
  jobId: 'stage-status-65fabc123',
  payload: { stageId: '65fabc123' },
  runAt: new Date('2026-05-01T10:00:00.000Z'),
});
```

Many jobs can share one `name`. Each scheduled job should have its own deterministic `jobId`.

## Storage Adapters

MongoDB is built in:

```ts
import { createMongoAdapter, createScheduler } from 'lazy-scheduler';

const scheduler = createScheduler({
  queueName: 'scheduler',
  redisConnection,
  store: createMongoAdapter({ mongoose }),
});
```

Shortcut:

```ts
const scheduler = createScheduler({
  queueName: 'scheduler',
  redisConnection,
  mongoose,
});
```

Custom adapters can target PostgreSQL, MySQL, DynamoDB, or another store:

```ts
import { defineStorageAdapter } from 'lazy-scheduler';

const postgresStore = defineStorageAdapter({
  upsertScheduledJob: async (input, options) => {},
  markQueued: async (jobId, bullJobId) => {},
  markRunning: async (jobId, version) => {},
  markCompleted: async (jobId, version) => {},
  markFailed: async (jobId, version, error, retryable) => {},
  markDeadLetter: async (jobId, version, error) => {},
  markCancelled: async (jobId) => {},
  markExpired: async (jobId) => {},
  findReconcileCandidates: async (staleRunningAfterMs, limit) => {},
  getByJobId: async (jobId) => {},
  list: async (filter) => {},
});

const scheduler = createScheduler({
  queueName: 'scheduler',
  redisConnection,
  store: postgresStore,
});
```

Adapter guarantees:

- `jobId` must be unique.
- `version` must identify the current logical schedule.
- state transitions should be atomic.
- terminal jobs must not move back to active states.
- reconciliation must return pending, queued, retryable failed, and stale running jobs.

## Production Safety Included

- Redis-backed reconciliation lock for multi-instance scheduler deployments.
- Atomic storage transitions in the Mongo adapter.
- Versioned BullMQ job IDs to protect against stale deliveries.
- Dead-letter status for exhausted jobs.
- `listDeadLetters()` for failure inspection.
- Worker concurrency defaults to available CPU parallelism.

## Configuration

```ts
createScheduler({
  queueName: 'scheduler',
  redisConnection,
  store,
  logger,
  worker: {
    concurrency: 'auto',
  },
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    staleRunningAfterMs: 10 * 60 * 1000,
    deadLetterOnExhausted: true,
    reconcileBatchSize: 1000,
  },
  locks: {
    enabled: true,
    keyPrefix: 'scheduler',
    ttlMs: 30000,
    instanceId: 'scheduler-1',
  },
});
```

## AI Integration Prompt

Use this prompt when asking an AI coding agent to integrate `lazy-scheduler` into a Node.js server:

```text
Integrate the local lazy-scheduler package into this server.

Requirements:
- Create one scheduler singleton during server startup.
- Use createScheduler from lazy-scheduler.
- Use createMongoAdapter({ mongoose }) unless this codebase already has a custom SchedulerStore adapter.
- Pass the existing Redis/BullMQ connection config as redisConnection.
- Register all job handlers before calling scheduler.start().
- Each registered job must have a stable unique name like "stage:status-check".
- Each scheduled job must use a deterministic jobId like "stage-status-${stageId}".
- Call await scheduler.start() during boot.
- Call await scheduler.reconcile() after handlers are registered and the worker has started.
- On shutdown, call await scheduler.shutdown().
- Do not put business logic inside routes. Routes/services should call scheduler.schedule(), scheduler.cancel(), scheduler.get(), or scheduler.list().
- Keep job handlers thin: validate payload, call existing service/domain function, return the result.
- Handlers must be idempotent because BullMQ execution is at-least-once.
- If scheduling the same logical work again, reuse the same jobId so the package can replace/reschedule it.
- Do not bypass the storage adapter or BullMQ queue directly from application code.

Expected server boot shape:
1. Load environment.
2. Connect database.
3. Create scheduler.
4. Register jobs.
5. Start worker.
6. Reconcile pending/stale jobs.
7. Start HTTP server.

Expected usage:

const scheduler = createScheduler({
  queueName: 'scheduler',
  redisConnection,
  store: createMongoAdapter({ mongoose }),
  worker: { concurrency: 'auto' },
});

scheduler.register({
  name: 'example:job',
  handler: async (payload, context) => {
    return exampleService.run(payload.id, context);
  },
});

await scheduler.start();
await scheduler.reconcile();

await scheduler.schedule({
  name: 'example:job',
  jobId: `example-job-${id}`,
  payload: { id },
  runAt,
  attempts: 3,
});
```

## Current Limitations

- No recurring/cron API yet.
- No dead-letter replay API yet.
- No built-in handler idempotency store yet.
- No metrics/dashboard yet.
- No rate limiting or per-job-type backpressure yet.
- No first-party PostgreSQL adapter yet.

## Recurring Job Direction

Recurring jobs should be durable definitions in storage, not only BullMQ repeatables.

Intended model:

1. Store a recurring definition like `weekly-leaderboard-bgmi`.
2. Compute the next `runAt` from cron expression and timezone.
3. Schedule that occurrence as a normal one-time job.
4. After the occurrence finishes, compute and schedule the next one.

This keeps recurring jobs recoverable through the same reconciliation path.

## Roadmap

- PostgreSQL adapter.
- Recurring/cron definitions.
- Dead-letter replay API.
- Idempotency helper store.
- Retry classification.
- Metrics and dashboard hooks.
- Rate limiting and backpressure.

## License

MIT
