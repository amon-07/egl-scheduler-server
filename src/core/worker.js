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

let _worker = null;

async function processJob(job) {
  const jobDef = registry.get(job.name);
  if (!jobDef) {
    throw new Error(`No handler registered for "${job.name}"`);
  }

  const { _meta, ...payload } = job.data;
  const context = { jobId: job.id, meta: _meta, attempt: job.attemptsMade + 1 };

  const start = Date.now();
  console.log(`[worker] ▶ processing "${job.name}" (${job.id}) attempt=${context.attempt} scheduledFor=${_meta?.scheduledFor || 'n/a'}`);
  const result = await jobDef.handler(payload, context);
  console.log(`[worker] ✓ done "${job.name}" (${job.id}) in ${Date.now() - start}ms`);
  return result;
}

function start() {
  if (_worker) return _worker;

  _worker = new Worker(QUEUE_NAME, processJob, {
    connection: redisConnection,
    concurrency: 5,
  });

  _worker.on('active', (job) => {
    console.log(`[worker] ⏱ time-hit "${job.name}" (${job.id}) at ${new Date().toISOString()}`);
  });

  _worker.on('completed', (job) => {
    console.log(`[worker] ✓ completed "${job.name}" (${job.id}) at ${new Date().toISOString()}`);
  });

  _worker.on('failed', (job, err) => {
    console.error(`[worker] ✗ failed "${job?.name}" (${job?.id}) attempt=${job?.attemptsMade}/${job?.opts?.attempts}: ${err.message}`);
  });

  _worker.on('stalled', (jobId) => {
    console.warn(`[worker] ⚠ stalled "${jobId}" — will be retried`);
  });

  _worker.on('error', (err) => {
    console.error(`[worker] error: ${err.message}`);
  });

  console.log(`[worker] started on queue "${QUEUE_NAME}" (concurrency=5)`);
  return _worker;
}

async function stop() {
  if (_worker) {
    await _worker.close();
    _worker = null;
    console.log('[worker] stopped');
  }
}

module.exports = { start, stop };
