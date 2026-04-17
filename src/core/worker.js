/**
 * Worker — processes jobs off the scheduler queue.
 *
 * Verbose logging is intentional: the scheduler runs as a standalone service
 * in prod, and `journalctl -u scheduler` is the primary observability tool.
 */

const { Worker } = require('bullmq');
const { redisConnection } = require('../config/redis.config');
const registry = require('./registry');
const { QUEUE_NAME } = require('./scheduler');
const log = require('../utils/logger');

const TAG = 'worker';

let _worker = null;

async function processJob(job) {
  const jobDef = registry.get(job.name);
  if (!jobDef) {
    throw new Error(`No handler registered for "${job.name}"`);
  }

  const { _meta, ...payload } = job.data;
  const context = { jobId: job.id, meta: _meta, attempt: job.attemptsMade + 1 };
  const maxAttempts = job.opts?.attempts || 'n/a';

  const start = Date.now();
  log.info(TAG, `Processing "${job.name}"`, {
    jobId: job.id,
    attempt: `${context.attempt}/${maxAttempts}`,
    scheduledFor: _meta?.scheduledFor || 'n/a',
    payload,
  });

  const result = await jobDef.handler(payload, context);

  log.info(TAG, `Completed "${job.name}"`, {
    jobId: job.id,
    durationMs: Date.now() - start,
    result,
  });

  return result;
}

function start() {
  if (_worker) return _worker;

  _worker = new Worker(QUEUE_NAME, processJob, {
    connection: redisConnection,
    concurrency: 5,
  });

  _worker.on('active', (job) => {
    log.info(TAG, `Job picked up: "${job.name}"`, {
      jobId: job.id,
      scheduledFor: job.data?._meta?.scheduledFor || 'n/a',
    });
  });

  _worker.on('completed', (job) => {
    log.info(TAG, `Job done: "${job.name}"`, { jobId: job.id });
  });

  _worker.on('failed', (job, err) => {
    log.error(TAG, `Job failed: "${job?.name}"`, {
      jobId: job?.id,
      attempt: `${job?.attemptsMade}/${job?.opts?.attempts}`,
      error: err.message,
      stack: err.stack,
    });
  });

  _worker.on('stalled', (jobId) => {
    log.warn(TAG, 'Job stalled — will be retried', { jobId });
  });

  _worker.on('error', (err) => {
    log.error(TAG, 'Worker error', { error: err.message });
  });

  log.info(TAG, `Started on queue "${QUEUE_NAME}" (concurrency=5)`);
  return _worker;
}

async function stop() {
  if (_worker) {
    await _worker.close();
    _worker = null;
    log.info(TAG, 'Stopped');
  }
}

module.exports = { start, stop };
