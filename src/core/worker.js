/**
 * Worker — Processes scheduled jobs when their time arrives
 *
 * Execution flow for each job:
 *   1. Look up the registered handler by job name
 *   2. Run handler with payload + context
 *   3. Return result with timing info
 *
 * Wraps everything with structured logging, timing, and error propagation.
 */

const { Worker } = require('bullmq');
const { redisConnection } = require('../config/redis.config');
const registry = require('./registry');
const { QUEUE_NAME } = require('./scheduler');

let _worker = null;

/**
 * Process a single job.
 *
 * @param {import('bullmq').Job} job
 * @returns {Promise<object>}
 */
async function processJob(job) {
  const { name, data, id, attemptsMade } = job;
  const startTime = Date.now();

  console.log(`\n[worker] ▶ Processing "${name}" (id: ${id}, attempt: ${attemptsMade + 1})`);

  // Separate internal fields from the actual payload
  const { _meta, ...payload } = data;
  const context = { jobId: id, meta: _meta, attempt: attemptsMade + 1 };

  const jobDef = registry.get(name);
  if (!jobDef) {
    throw new Error(`Job "${name}" has no registered handler. Nothing to execute.`);
  }

  const handlerResult = await jobDef.handler(payload, context);

  const duration = Date.now() - startTime;
  console.log(`[worker] ✓ "${name}" completed in ${duration}ms`);

  return {
    handlerResult,
    _duration: duration,
  };
}

/**
 * Start the worker. Idempotent.
 *
 * @returns {import('bullmq').Worker}
 */
function start() {
  if (_worker) return _worker;

  _worker = new Worker(QUEUE_NAME, processJob, {
    connection: redisConnection,
    concurrency: 5,
    limiter: { max: 20, duration: 1000 },
  });

  _worker.on('completed', (job, result) => {
    console.log(`[worker] Job "${job.name}" (${job.id}) done — duration: ${result?._duration}ms`);
  });

  _worker.on('failed', (job, err) => {
    console.error(`[worker] Job "${job?.name}" (${job?.id}) FAILED [attempt ${job?.attemptsMade}/${job?.opts?.attempts}]: ${err.message}`);
  });

  _worker.on('stalled', (jobId) => {
    console.warn(`[worker] Job ${jobId} stalled — will be retried`);
  });

  console.log(`[worker] Started on queue "${QUEUE_NAME}" (concurrency: 5)`);
  return _worker;
}

/**
 * Stop the worker gracefully.
 */
async function stop() {
  if (_worker) {
    await _worker.close();
    _worker = null;
    console.log('[worker] Stopped.');
  }
}

module.exports = { start, stop };
