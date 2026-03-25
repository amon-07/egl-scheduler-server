/**
 * Scheduler Server — Entry Point
 *
 * Thin bootstrap: load jobs, start worker, mount routes, listen.
 */

require('dotenv').config();
const express = require('express');

// ── 1. Register all job handlers (must be before worker starts) ──────
const { loadAll } = require('./jobs');
loadAll();

// ── 2. Start worker (begins processing jobs from Redis) ─────────────
const worker = require('./core/worker');
const scheduler = require('./core/scheduler');
worker.start();

// ── 3. Crash recovery — promote jobs that missed their fire time ────
scheduler.recover().catch((err) => {
  console.error('[scheduler] Recovery failed:', err.message);
});

// ── 4. Mount module routes ──────────────────────────────────────────
const app = express();
app.use(express.json());

const testingRoutes = require('./modules/testing/testing.routes');
app.use('/', testingRoutes);

// ── 5. Start server ─────────────────────────────────────────────────
const PORT = process.env.PORT || 4010;

app.listen(PORT, () => {
  console.log(`\nScheduler server running on http://localhost:${PORT}`);
  console.log(`\nRoutes:`);
  console.log(`  GET    /health       — health check + registered job types`);
  console.log(`  POST   /schedule     — schedule a job`);
  console.log(`  GET    /jobs         — list pending jobs`);
  console.log(`  DELETE /jobs/:jobId  — cancel a scheduled job`);
  console.log();
});

// ── 6. Graceful shutdown ────────────────────────────────────────────
async function gracefulShutdown() {
  console.log('\nShutting down...');
  await worker.stop();
  await scheduler.shutdown();
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
