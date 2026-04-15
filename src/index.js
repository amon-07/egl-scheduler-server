/**
 * Scheduler Server — Entry Point
 */

require('dotenv').config();
const express = require('express');
const { connectDB } = require('./config/db.config');

const { loadAll } = require('./jobs');
const worker = require('./core/worker');
const scheduler = require('./core/scheduler');
const registry = require('./core/registry');
const { shutdownCacheInvalidation } = require('./utils/cache-invalidation.utils');
const { ensureRecurringSchedules } = require('./bootstrap/recurring-jobs.bootstrap');

const app = express();
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf ? buf.toString('utf8') : '';
  },
}));

app.get('/health', (_req, res) => {
  res.json({
    status: true,
    data: {
      uptime: process.uptime(),
      registeredJobs: registry.listRegistered(),
    },
  });
});

const v1JobsRoutes = require('./modules/v1-jobs/v1-jobs.routes');
app.use('/v1/jobs', v1JobsRoutes);

const PORT = process.env.PORT || process.env.SCHEDULER_PORT || 4010;
let server = null;

async function bootstrap() {
  await connectDB();
  loadAll();
  worker.start();

  ensureRecurringSchedules().catch((err) => {
    console.error('[scheduler:recurring] setup failed:', err.message);
  });

  server = app.listen(PORT, () => {
    console.log(`Scheduler server running on http://localhost:${PORT}`);
  });
}

async function gracefulShutdown() {
  console.log('\nShutting down...');
  if (server) await new Promise((resolve) => server.close(resolve));
  await worker.stop();
  await scheduler.shutdown();
  await shutdownCacheInvalidation();
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

bootstrap().catch((error) => {
  console.error('[scheduler] fatal startup error:', error.message);
  process.exit(1);
});
