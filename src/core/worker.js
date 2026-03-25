/**
 * Worker — Processes scheduled jobs when their time arrives
 *
 * Execution flow for each job:
 *
 *   1. If job has _callback → HTTP request to callback URL with payload
 *   2. If job has a registered handler → run handler with payload + callback response
 *   3. If neither → error (job must have at least one)
 *
 * This means:
 *   - callback only    → fire-and-forget HTTP call to main backend (most common in prod)
 *   - handler only     → local processing (useful for testing or embedded use)
 *   - callback + handler → HTTP call first, then handler gets both payload & response
 *
 * Wraps everything with structured logging, timing, and error propagation.
 */

const { Worker } = require('bullmq');
const { redisConnection } = require('../config/redis.config');
const { request: httpRequest } = require('../utils/http.utils');
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
  const { _meta, _callback, ...payload } = data;
  const context = { jobId: id, meta: _meta, attempt: attemptsMade + 1 };

  const jobDef = registry.get(name);
  if (!_callback && !jobDef) {
    throw new Error(`Job "${name}" has no callback and no registered handler. Nothing to execute.`);
  }

  let callbackResult = null;
  let handlerResult = null;

  // ── Step 1: Execute HTTP callback (if provided) ────────────────
  if (_callback) {
    callbackResult = await executeCallback(_callback, payload, context);
  }

  // ── Step 2: Execute registered handler (if exists) ─────────────
  if (jobDef) {
    handlerResult = await jobDef.handler(payload, { ...context, callbackResult });
  }

  const duration = Date.now() - startTime;
  console.log(`[worker] ✓ "${name}" completed in ${duration}ms`);

  return {
    callbackResult: callbackResult ? { status: callbackResult.status, duration: callbackResult.duration } : null,
    handlerResult,
    _duration: duration,
  };
}

/**
 * Execute an HTTP callback.
 *
 * @param {object} callback          — { url, method, headers, timeout }
 * @param {object} payload           — job data (sent as JSON body)
 * @param {object} context           — { jobId, meta, attempt }
 * @returns {Promise<{ status: number, data: any, duration: number }>}
 */
async function executeCallback(callback, payload, context) {
  const { url, method = 'POST', headers = {}, timeout } = callback;

  console.log(`[worker] → Callback: ${method} ${url}`);

  const response = await httpRequest({
    url,
    method,
    headers,
    body: {
      ...payload,
      _schedulerMeta: {
        jobId: context.jobId,
        scheduledFor: context.meta?.scheduledFor,
        firedAt: new Date().toISOString(),
        attempt: context.attempt,
      },
    },
    timeout,
  });

  console.log(`[worker] ← Callback response: ${response.status} (${response.duration}ms)`);
  return response;
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
