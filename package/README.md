# lazy-scheduler

Distributed job scheduler built on BullMQ, Redis, and MongoDB with lazy execution and durable persistence.

**Status: Alpha**
This project is under active development. APIs and behavior may change.

---

## Why This Exists

Most schedulers force a trade-off:

* Redis/BullMQ → fast but not durable ⚡
* Mongo-based schedulers → durable but slower 💾

This project combines both:

* MongoDB as the source of truth 📦
* Redis (BullMQ) as the execution layer ⚙️

Result:

* durable job storage
* fast execution
* scalable processing 🚀

---

## Features

* Mongo-backed persistence 📦
* BullMQ execution engine ⚡
* Lazy scheduling (jobs are enqueued only when needed) 💤
* Reconciliation engine to ensure consistency 🔁
* Registry-based job handlers 🧩
* Pluggable storage adapter; MongoDB is the built-in default
* TypeScript-first API

---

## Architecture

```text
Client → Scheduler → MongoDB (source of truth)
                         ↓
                 Reconciliation Engine
                         ↓
                  BullMQ (Redis)
                         ↓
                       Worker
```

### Flow

1. Job is scheduled and stored in MongoDB 📦
2. Reconciliation identifies due jobs 🔁
3. Job is pushed to BullMQ ⚙️
4. Worker processes the job
5. State is updated in MongoDB

---

## Installation

```bash
npm install lazy-scheduler
```

---

## Quick Example

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
    console.log('Sending email to:', userId);
  },
});

await scheduler.start();
await scheduler.reconcile();

await scheduler.schedule({
  name: 'send-email',
  jobId: 'send-email-123',
  payload: { userId: '123' },
  runAt: new Date(Date.now() + 5000),
});
```

---

## Storage Adapters

MongoDB is the default built-in persistence adapter, but the scheduler core depends on a storage interface, not Mongo-specific behavior.

Use the built-in Mongo adapter:

```ts
import { createMongoAdapter, createScheduler } from 'lazy-scheduler';

const scheduler = createScheduler({
  queueName: 'scheduler',
  redisConnection,
  store: createMongoAdapter({ mongoose }),
});
```

There is also a shorthand if you want the package to create the Mongo adapter for you:

```ts
const scheduler = createScheduler({
  queueName: 'scheduler',
  redisConnection,
  mongoose,
});
```

Or provide your own adapter for PostgreSQL, MySQL, DynamoDB, or anything else:

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

Custom adapters must preserve the same guarantees as the Mongo adapter:

* unique `jobId`
* monotonic logical `version`
* atomic state transitions
* terminal jobs cannot move back to active states
* reconciliation queries must return pending, queued, retryable failed, and stale running jobs

---

## API Overview

### Scheduling

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

---

## Design Principles

* MongoDB is the source of truth 📦
* Redis is an execution layer, not storage ⚙️
* Jobs are persisted before execution
* System is eventually consistent with correction (reconciliation) 🔁
* BullMQ execution is treated as at-least-once; handlers should be idempotent
* Logical jobs are versioned so stale BullMQ deliveries cannot complete a newer Mongo schedule

---

## Production Safety Included

Current package hardening:

* Redis-backed reconciliation lock for multi-instance scheduler deployments
* Atomic Mongo state transitions for queued/running/completed/failed states
* Versioned logical jobs to protect against stale deliveries after reschedule
* Dead-letter status for exhausted jobs
* `listDeadLetters()` API for failure inspection
* Automatic worker concurrency by default via `worker.concurrency: 'auto'`

---

## Limitations (Alpha)

Current gaps:

* No cron / recurring jobs yet
* No built-in handler idempotency store; application handlers must still be idempotent
* No dead-letter replay API yet
* No advanced retry classification yet
* No metrics or dashboard
* No rate limiting / backpressure

---

## Roadmap

### Stability

* Mongo TTL cleanup
* Dead-letter replay API
* Idempotency helper store

### Reliability

* Retry strategies
* Failure classification

### Features

* Cron / recurring jobs using durable recurring definitions
* Priority queues
* Rate limiting

## Recurring Job Direction

Recurring jobs should be implemented as durable definitions in Mongo, not only BullMQ repeatables.

The intended model:

1. Store a recurring definition like `weekly-leaderboard-bgmi`.
2. Compute the next `runAt` from a cron expression and timezone.
3. Schedule that occurrence as a normal one-time job.
4. After the worker finishes the occurrence, compute and schedule the next one.

That keeps recurring jobs recoverable through the same Mongo + reconciliation path.

### Observability

* Metrics
* Dashboard
* Tracing

---

## Comparison

| Feature         | BullMQ | Agenda | This   |
| --------------- | ------ | ------ | ------ |
| Speed           | High ⚡ | Low    | High ⚡ |
| Persistence     | No     | Yes 💾 | Yes 💾 |
| Lazy Scheduling | No     | No     | Yes 💤 |

---

## When To Use

* You need durable delayed jobs 📦
* You already use BullMQ and Redis ⚙️
* You want Mongo-backed scheduling

---

## When Not To Use

* Mission-critical production systems (yet) ⚠️
* Strong consistency requirements
* Multi-region distributed systems

---

## Tech Stack

* BullMQ ⚙️
* Redis ⚡
* MongoDB 📦
* Mongoose
* Adapters ( for Persistent storage )

---

## Keywords

bullmq scheduler, redis job queue, mongodb scheduler, nodejs background jobs, distributed job scheduler

---

## License

MIT

---

## Final Note

This project is not trying to replace existing schedulers.

It aims to combine:
* Simplicity
* Redis speed ⚡
* Mongo durability 💾

into a single, scalable scheduling model 🚀
