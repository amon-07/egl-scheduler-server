/**
 * Worker — processes jobs off the scheduler queue.
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
  console.log(`[worker] ▶ ${job.name} (${job.id}) attempt=${context.attempt}`);
  const result = await jobDef.handler(payload, context);
  console.log(`[worker] ✓ ${job.name} (${job.id}) in ${Date.now() - start}ms`);
  return result;
}

function start() {
  if (_worker) return _worker;

  _worker = new Worker(QUEUE_NAME, processJob, {
    connection: redisConnection,
    concurrency: 5,
  });

  _worker.on('failed', (job, err) => {
    console.error(`[worker] ✗ ${job?.name} (${job?.id}) attempt=${job?.attemptsMade}: ${err.message}`);
  });

  console.log(`[worker] started on queue "${QUEUE_NAME}"`);
  return _worker;
}

async function stop() {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
}

module.exports = { start, stop };
