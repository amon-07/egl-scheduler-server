# Scheduler Server

A standalone delayed-job scheduling service built on **BullMQ**, **Redis**, and **Express**. It accepts HTTP requests to schedule jobs at a future date/time (in IST), persists them in Redis, and executes registered handlers when the time arrives.

Built for the EGL backend to handle time-sensitive operations like block go-lives, match starts, and notification triggers.

---

## System Design

```
                         ┌──────────────────────────────────────────────────────┐
                         │                  SCHEDULER SERVER                    │
                         │                                                      │
  HTTP Request           │   Routes ─── Controller ─── Service ─── Scheduler    │
  POST /schedule ───────►│                                            │         │
                         │                                       ┌────▼────┐    │
                         │                                       │  Redis  │    │
                         │                                       │ (BullMQ │    │
                         │                                       │  Queue) │    │
                         │                                       └────┬────┘    │
                         │                                            │         │
                         │   Worker ◄─────────────────────────────────┘         │
                         │     │                                                │
                         │     └── Registered job handler runs                  │
                         │                                                      │
                         └──────────────────────────────────────────────────────┘
```

### Request Flow (Scheduling)

```
POST /schedule { name, time, data, jobId }
  │
  ├─ testing.routes.js        Route definition
  ├─ testing.controller.js    Extract & validate request body
  ├─ testing.service.js       Business logic validation
  └─ core/scheduler.js        Parse time (IST → UTC), calculate delay, add to BullMQ queue
       ├─ core/registry.js    Verify job name is registered
       └─ utils/time.utils.js Parse human-readable time input
```

### Execution Flow (When Job Fires)

```
BullMQ delay expires → Worker picks up job
  │
  └─ Look up registered handler by job name
       └─ Run handler(payload, context)
```

---

## Architecture

```
src/
├── index.js                         Entry point — bootstrap & server
├── config/
│   └── redis.config.js              Redis connection (single source of truth)
├── core/
│   ├── scheduler.js                 Queue API: schedule, cancel, list, recover
│   ├── worker.js                    Job processor
│   └── registry.js                  Job type registry (name → handler map)
├── jobs/
│   ├── index.js                     Auto-loader: scans *.job.js and registers
│   └── test.job.js                  Example job handler
├── modules/
│   └── testing/
│       ├── testing.routes.js        HTTP route definitions
│       ├── testing.controller.js    Request/response handling
│       └── testing.service.js       Business logic layer
└── utils/
    └── time.utils.js                IST time parsing & formatting
```

### Layer Responsibilities

| Layer | Files | Role |
|---|---|---|
| **Routes** | `testing.routes.js` | HTTP method + path mapping |
| **Controller** | `testing.controller.js` | Extract request params, format response, catch errors |
| **Service** | `testing.service.js` | Validate business rules, delegate to core |
| **Core** | `scheduler.js`, `worker.js`, `registry.js` | Queue management, job processing, handler registry |
| **Utils** | `time.utils.js` | Time parsing (IST) and formatting |
| **Jobs** | `jobs/*.job.js` | Individual job handlers (auto-loaded) |

---

## Features

### IST-Native Time Parsing

All human-readable time inputs are interpreted as **Indian Standard Time (UTC+5:30)**. The server converts to UTC internally for BullMQ and converts back to IST for all logs and API responses.

Supported `time` formats:

| Format | Example | Behavior |
|---|---|---|
| Time only | `"3:30 PM"`, `"14:00"`, `"11 AM"` | Today IST, or tomorrow if already passed |
| Date + Time (DD-MM-YYYY) | `"25-03-2026 3:30 PM"` | Exact IST datetime |
| Date + Time (YYYY-MM-DD) | `"2026-03-25 14:00"` | Exact IST datetime |
| Relative | `"in 5m"`, `"in 2h"`, `"in 30s"`, `"in 1d"` | From current moment |
| ISO-8601 | `"2026-03-25T10:00:00Z"` | Exact UTC (passed through) |
| Unix timestamp (ms) | `1711360000000` | Exact (passed through) |

### Job Upsert

When scheduling with a `jobId`, if a job with that ID already exists (in any state — delayed, waiting, completed, or failed), the old job is removed and replaced with the new one. This allows rescheduling without manual cancellation.

### Auto-Loading Job Handlers

Drop a `*.job.js` file in `src/jobs/` and it gets registered automatically on startup. No wiring code needed.

### Crash Recovery

On startup, the server scans all delayed jobs in Redis. Any job whose scheduled time has already passed (e.g., the server was down when it should have fired) is **promoted** for immediate processing. The recovery logs exactly which jobs were missed and by how much.

```
[scheduler] Recovery: promoted "block:go-live" (block-123) — was due 25 Mar 2026, 2:11 pm IST, missed by 4m 30s
[scheduler] Recovery complete: 1 missed job(s) promoted for immediate processing.
```

### Retry & Backoff

Jobs retry on failure with exponential backoff (default: 3 attempts, 3s/6s/12s). Individual jobs can override via the `options` field in their job definition.

### Graceful Shutdown

On `SIGINT`/`SIGTERM`, the server drains the worker (finishes in-progress jobs) and closes the Redis connection cleanly.

---

## API Reference

### `POST /schedule`

Schedule a delayed job.

**Request Body:**

```json
{
  "name": "test",
  "time": "25-03-2026 3:30 PM",
  "data": { "userId": "123", "action": "notify" },
  "jobId": "notif-123"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Registered job type name |
| `time` | string | Yes | When to fire (IST) — see formats above |
| `data` | object | No | Payload passed to the job handler |
| `jobId` | string | No | Custom ID for deduplication/upsert |

**Response:**

```json
{
  "status": true,
  "data": {
    "jobId": "notif-123",
    "name": "test",
    "scheduledFor": "2026-03-25T10:00:00.000Z",
    "scheduledForIST": "25 Mar 2026, 3:30 pm IST",
    "delay": "2h 15m",
    "delayMs": 8100000,
    "replaced": false
  }
}
```

### `GET /jobs`

List all pending (delayed + waiting) jobs.

**Response:**

```json
{
  "status": true,
  "data": {
    "count": 1,
    "jobs": [
      {
        "id": "notif-123",
        "name": "test",
        "data": { "userId": "123", "action": "notify" },
        "scheduledFor": "2026-03-25T10:00:00.000Z",
        "delayUntil": "2026-03-25T10:00:00.000Z",
        "state": "delayed"
      }
    ]
  }
}
```

### `DELETE /jobs/:jobId`

Cancel a scheduled job.

**Response:**

```json
{
  "status": true,
  "data": { "cancelled": true, "jobId": "notif-123" }
}
```

### `GET /health`

Health check with list of registered job types.

**Response:**

```json
{
  "status": true,
  "data": {
    "uptime": 142.5,
    "registeredJobs": ["test"]
  }
}
```

---

## Adding a New Job Type

Create a file in `src/jobs/` following the `*.job.js` naming convention:

```javascript
// src/jobs/block-go-live.job.js

module.exports = {
  name: 'block:go-live',

  handler: async (payload, context) => {
    // payload  = the data you sent when scheduling
    // context  = { jobId, meta, attempt }

    console.log(`Block ${payload.blockId} is going live!`);
    return { success: true };
  },

  // Optional: override default BullMQ job options
  options: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
  },
};
```

Restart the server. The job is auto-registered and available via `POST /schedule` with `"name": "block:go-live"`.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4010` | Server port |
| `REDIS_HOST` | `127.0.0.1` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_USERNAME` | — | Redis username |
| `REDIS_PASSWORD` | — | Redis password |
| `REDIS_TLS` | `false` | Set to `"true"` to enable TLS |

Create a `.env` file in the project root:

```env
PORT=4010
REDIS_HOST=your-redis-host.com
REDIS_PORT=15550
REDIS_PASSWORD=your-password
REDIS_USERNAME=default
```

---

## Setup

```bash
npm install
npm run dev    # development (auto-restart on file changes)
npm start      # production
```

**Redis requirement:** The Redis instance must use the `noeviction` eviction policy. BullMQ relies on Redis keys not being silently evicted; using any other policy risks losing scheduled jobs.

---

## Stack

| Component | Purpose |
|---|---|
| **Express** | HTTP server for the scheduling API |
| **BullMQ** | Redis-backed job queue with delayed job support |
| **ioredis** | Redis client (required by BullMQ) |
| **Redis** | Persistence layer — jobs survive server restarts |
