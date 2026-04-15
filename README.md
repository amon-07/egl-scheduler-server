# Scheduler Server

Standalone delayed-job scheduling service built on **BullMQ** + **Redis** + **Express**. Accepts HMAC-signed HTTP requests from the main EGL backend to schedule jobs at a future datetime, persists them in Redis, and executes registered handlers when their fire time arrives.

## Architecture

```
src/
├── index.js                             Entry point — boot, mount routes, listen
├── bootstrap/
│   └── recurring-jobs.bootstrap.js      Register cron jobs on startup
├── config/
│   ├── db.config.js                     Mongo connection
│   └── redis.config.js                  Redis connection
├── constants/
│   └── status.constants.js
├── core/
│   ├── scheduler.js                     Queue API (schedule, cancel, list)
│   ├── worker.js                        Job processor
│   └── registry.js                      Job-name → handler map
├── domain/
│   └── status-automation.domain.js      Business logic for tournament/stage status
├── integrations/
│   └── admin-backend.client.js          Calls admin backend for leaderboard/POTM
├── jobs/                                Auto-loaded *.job.js files
│   ├── index.js
│   ├── leaderboard-global-recalculate.job.js
│   ├── potm-recalculate.job.js
│   ├── stage-status-check.job.js
│   └── tournament-status-check.job.js
├── middleware/
│   └── hmac.middleware.js               Verify x-scheduler-* headers
├── models/
│   ├── stage-registration.model.js
│   ├── stage.model.js
│   └── tournament.model.js
├── modules/
│   └── v1-jobs/                         HTTP endpoints for main backend
│       ├── v1-jobs.routes.js
│       ├── v1-jobs.controller.js
│       └── v1-jobs.service.js
└── utils/
    └── cache-invalidation.utils.js      Publishes Redis cache invalidations
```

## API

All `/v1/jobs/*` routes require HMAC headers (`x-scheduler-key-id`, `x-scheduler-timestamp`, `x-scheduler-signature`).

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | uptime + registered job names |
| PUT | `/v1/jobs/stage-status/:stageId` | schedule stage status check |
| PUT | `/v1/jobs/tournament-status/:tournamentId` | schedule tournament status check |
| PUT | `/v1/jobs/leaderboard/global/:gameId` | schedule global leaderboard recalculate |
| PUT | `/v1/jobs/potm/recalculate/:gameId` | schedule POTM recalculate |
| POST | `/v1/jobs/status-sync/bulk` | schedule all active tournaments + stages |
| GET | `/v1/jobs/:jobId` | fetch current state |
| DELETE | `/v1/jobs/:jobId` | cancel |

All scheduling endpoints accept `{ runAt }` as ISO-8601 in the body.

## Recurring Jobs

On startup, reads env vars and registers cron-driven jobs via `upsertJobScheduler` (idempotent):

| Env var | Default | Cron |
|---|---|---|
| `SCHEDULER_POTM_CRON` | `0 1 1 * *` | 1st of month, 01:00 IST |
| `SCHEDULER_GLOBAL_LEADERBOARD_CRON` | `0 1 * * 0` | Sunday, 01:00 IST |
| `SCHEDULER_POTM_GAME_IDS` | — | comma-separated game IDs |
| `SCHEDULER_GLOBAL_LEADERBOARD_GAME_IDS` | — | comma-separated game IDs |

Set `SCHEDULER_ENABLE_RECURRING=false` to skip recurring setup.

## Adding a New Job Type

Drop a `*.job.js` file into `src/jobs/`:

```js
module.exports = {
  name: 'my:thing',
  handler: async (payload, context) => {
    // work here
    return { ok: true };
  },
  options: { attempts: 3 },   // optional BullMQ overrides
};
```

Restart. The job auto-registers via the loader in `jobs/index.js`.

## Setup

```bash
cp .env.example .env
# edit .env with real Redis + HMAC + Mongo + admin-backend values
npm install
npm run dev   # watch mode
npm start     # production
```

**Redis requirement:** the instance must use `noeviction` so BullMQ keys aren't silently dropped.

## Stack

| Component | Purpose |
|---|---|
| Express | HTTP server for scheduling API |
| BullMQ (v5) | Redis-backed delayed + repeatable job queue |
| ioredis | Redis client (required by BullMQ) |
| Mongoose | Reads tournament/stage docs from Mongo |
