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
const log = require('./utils/logger');
const { requestLogger } = require('./middleware/request-logger.middleware');

const app = express();
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf ? buf.toString('utf8') : '';
  },
}));

// Request logging — logs every incoming request and outgoing response
app.use(requestLogger);

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
    log.error('scheduler:recurring', 'Recurring job setup failed', { error: err.message });
  });

  server = app.listen(PORT, () => {
    log.info('scheduler', `Server running on port ${PORT}`, {
      registeredJobs: registry.listRegistered(),
    });
  });
}

async function gracefulShutdown() {
  log.info('scheduler', 'Shutting down...');
  if (server) await new Promise((resolve) => server.close(resolve));
  await worker.stop();
  await scheduler.shutdown();
  await shutdownCacheInvalidation();
  log.info('scheduler', 'Shutdown complete');
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

bootstrap().catch((error) => {
  log.error('scheduler', 'Fatal startup error', { error: error.message, stack: error.stack });
  process.exit(1);
});
