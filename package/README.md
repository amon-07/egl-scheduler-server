# lazy-scheduler

Mongo-backed lazy scheduler skeleton for BullMQ workers.

## Concept

`register()` teaches the scheduler which job types exist.
`schedule()` creates one durable job instance for a registered job type.
`reconcile()` repairs Mongo/BullMQ drift on server startup.

Mongo is the source of truth for schedule intent and history. BullMQ/Redis is the execution engine.

## Usage

```ts
import { createScheduler } from 'lazy-scheduler';

const scheduler = createScheduler({
  queueName: 'scheduler',
  redisConnection,
  mongoose,
  logger,
  worker: { concurrency: 5 },
});

scheduler.register({
  name: 'stage:status-check',
  handler: async (payload, context) => {
    return handleStageStatusCheck(payload.stageId, context);
  },
  defaultOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
  },
});

await scheduler.start();
await scheduler.reconcile();

await scheduler.schedule({
  name: 'stage:status-check',
  jobId: 'stage-status-123',
  payload: { stageId: '123' },
  runAt: new Date(),
});
```

## Status

This package currently contains the compile-safe skeleton and module boundaries for:

- registry
- schedule/cancel/get/list operations
- BullMQ queue adapter
- BullMQ worker wrapper
- Mongo schedule ledger
- startup reconciliation

