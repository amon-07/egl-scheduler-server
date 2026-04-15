/**
 * Scheduler Server — Entry Point
 *
 * Thin bootstrap: load jobs, start worker, mount routes, listen.
 */

require('dotenv').config();
const express = require('express');
const { connectDB } = require('./config/db.config');

const { loadAll } = require('./jobs');
const worker = require('./core/worker');
const scheduler = require('./core/scheduler');
const { shutdownCacheInvalidation } = require('./utils/cache-invalidation.utils');
const { ensureRecurringSchedules } = require('./bootstrap/recurring-jobs.bootstrap');

// ── 4. Mount module routes ──────────────────────────────────────────
const app = express();
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf ? buf.toString('utf8') : '';
  },
}));

const testingRoutes = require('./modules/testing/testing.routes');
const v1JobsRoutes = require('./modules/v1-jobs/v1-jobs.routes');
app.use('/', testingRoutes);
app.use('/v1/jobs', v1JobsRoutes);

const PORT = process.env.PORT || process.env.SCHEDULER_PORT || 4010;
let server = null;

async function bootstrap() {
  await connectDB();

  // ── 1. Register all job handlers (must be before worker starts) ──────
  loadAll();

  // ── 2. Start worker (begins processing jobs from Redis) ─────────────
  worker.start();

  // ── 3. Crash recovery — promote jobs that missed their fire time ────
  scheduler.recover().catch((err) => {
    console.error('[scheduler] Recovery failed:', err.message);
  });

  ensureRecurringSchedules().catch((err) => {
    console.error('[scheduler:recurring] setup failed:', err.message);
  });

  server = app.listen(PORT, () => {
    console.log(`\nScheduler server running on http://localhost:${PORT}`);
    console.log(`\nRoutes:`);
    console.log(`  GET    /health       — health check + registered job types`);
    console.log(`  POST   /schedule     — schedule a job`);
    console.log(`  GET    /jobs         — list pending jobs`);
    console.log(`  DELETE /jobs/:jobId  — cancel a scheduled job`);
    console.log(`  PUT    /v1/jobs/stage-status/:stageId`);
    console.log(`  PUT    /v1/jobs/tournament-status/:tournamentId`);
    console.log(`  PUT    /v1/jobs/leaderboard/global/:gameId`);
    console.log(`  PUT    /v1/jobs/potm/recalculate/:gameId`);
    console.log(`  POST   /v1/jobs/status-sync/bulk`);
    console.log(`  GET    /v1/jobs/:jobId`);
    console.log(`  DELETE /v1/jobs/:jobId`);
    console.log();
  });
}

// ── 6. Graceful shutdown ────────────────────────────────────────────
async function gracefulShutdown() {
  console.log('\nShutting down...');
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await worker.stop();
  await scheduler.shutdown();
  await shutdownCacheInvalidation();
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

bootstrap().catch((error) => {
  console.error('[scheduler] Fatal startup error:', error.message);
  process.exit(1);
});
