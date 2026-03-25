/**
 * Scheduler — Public API for scheduling delayed jobs
 *
 * This is the only module external code should use to schedule/cancel/list jobs.
 * Owns the BullMQ Queue instance. Worker is separate (worker.js).
 *
 * Usage:
 *   const scheduler = require('./core/scheduler');
 *   await scheduler.schedule('block:go-live', { blockId: '123' }, '3:30 PM');
 *   await scheduler.schedule('match:start', { matchId: '456' }, '2026-03-28T18:00:00Z');
 *   await scheduler.cancel('block:go-live:123');
 *   const jobs = await scheduler.list();
 */

const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redis.config');
const { parseTime, formatIST, formatDelay } = require('../utils/time.utils');
const registry = require('./registry');

const QUEUE_NAME = 'scheduler';

const queue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});

/**
 * Schedule a delayed job. Handles both first-time and update (upsert).
 *
 * If opts.jobId is provided and a job with that ID already exists:
 *   → removes the old job first, then schedules the new one (overwrite).
 * This ensures time changes (e.g. block startDate moved from 3 PM → 5 PM)
 * always take effect.
 *
 * @param {string} name            — registered job name (e.g. "block:go-live")
 * @param {object} data            — payload passed to the handler
 * @param {string|number} runAt    — when to fire: "11 AM", "3:30 PM", ISO string, Unix ms
 * @param {object} [opts]          — optional overrides
 * @param {string} [opts.jobId]    — custom job ID for deduplication/upsert (recommended)
 * @param {object} [opts.callback] — HTTP callback config for when job fires
 * @param {string} opts.callback.url     — URL to call (e.g. "http://localhost:3000/internal/block/go-live")
 * @param {string} [opts.callback.method] — HTTP method (default: "POST")
 * @param {object} [opts.callback.headers] — extra headers (e.g. { "x-api-key": "..." })
 * @param {number} [opts.callback.timeout] — timeout in ms (default: 10000)
 * @returns {Promise<object>}      — { jobId, name, scheduledFor, delay, delayMs, replaced }
 */
async function schedule(name, data, runAt, opts = {}) {
  if (!registry.has(name)) {
    throw new Error(`Unknown job type: "${name}". Registered types: [${registry.listRegistered().join(', ')}]`);
  }

  const targetDate = parseTime(runAt);
  const delayMs = Math.max(targetDate.getTime() - Date.now(), 0);
  const jobDef = registry.get(name);

  // ── Upsert: if jobId exists, remove old job first ──────────────
  let replaced = false;
  if (opts.jobId) {
    const existing = await queue.getJob(opts.jobId);
    if (existing) {
      const state = await existing.getState();
      await existing.remove();
      replaced = true;
      console.log(`[scheduler] Removed existing job "${opts.jobId}" (was ${state}) — replacing with new schedule`);
    }
  }

  const jobOptions = {
    delay: delayMs,
    ...jobDef.options,
    ...(opts.jobId ? { jobId: opts.jobId } : {}),
  };

  console.log(`[scheduler:debug] jobOptions:`, JSON.stringify(jobOptions));

  const job = await queue.add(name, {
    ...data,
    _meta: {
      scheduledFor: targetDate.toISOString(),
      scheduledAt: new Date().toISOString(),
    },
    // Store callback config — worker reads this when job fires
    ...(opts.callback ? { _callback: opts.callback } : {}),
  }, jobOptions);

  // Verify job was actually added
  const state = await job.getState();
  console.log(`[scheduler:debug] Job "${job.id}" added — state: ${state}, delay: ${job.opts?.delay}ms`);

  const result = {
    jobId: job.id,
    name: job.name,
    scheduledFor: targetDate.toISOString(),
    scheduledForIST: formatIST(targetDate),
    delay: formatDelay(delayMs),
    delayMs,
    replaced,
    hasCallback: !!opts.callback,
  };

  console.log(`[scheduler] ${replaced ? 'Rescheduled' : 'Scheduled'} "${name}" → fires at ${result.scheduledForIST} (in ${result.delay})${opts.callback ? ` → callback: ${opts.callback.method || 'POST'} ${opts.callback.url}` : ''}`);
  return result;
}

/**
 * Cancel a scheduled job by ID.
 *
 * @param {string} jobId
 * @returns {Promise<boolean>} — true if removed, false if not found
 */
async function cancel(jobId) {
  const job = await queue.getJob(jobId);
  if (!job) return false;

  await job.remove();
  console.log(`[scheduler] Cancelled job "${jobId}"`);
  return true;
}

/**
 * List all pending (delayed + waiting) jobs.
 *
 * @returns {Promise<object[]>}
 */
async function list() {
  const [delayed, waiting] = await Promise.all([
    queue.getDelayed(),
    queue.getWaiting(),
  ]);

  return [...delayed, ...waiting].map((j) => ({
    id: j.id,
    name: j.name,
    data: j.data,
    scheduledFor: j.data?._meta?.scheduledFor || null,
    delayUntil: new Date(j.timestamp + j.delay).toISOString(),
    state: j.delay > 0 ? 'delayed' : 'waiting',
  }));
}

/**
 * Crash recovery — promote any delayed jobs whose fire time has already passed.
 *
 * When the server was down and a job's scheduled time expired, the job stays
 * stuck in "delayed" state. This promotes them to "waiting" so the worker
 * picks them up immediately on restart.
 *
 * Call once at startup, after the worker has started.
 */
async function recover() {
  const delayed = await queue.getDelayed();
  if (!delayed.length) {
    console.log('[scheduler] Recovery: no delayed jobs found — nothing to recover.');
    return;
  }

  const now = Date.now();
  let promoted = 0;

  for (const job of delayed) {
    const fireAt = job.timestamp + (job.opts?.delay || 0);
    if (fireAt <= now) {
      await job.promote();
      promoted++;
      const missedBy = formatDelay(now - fireAt);
      console.log(`[scheduler] Recovery: promoted "${job.name}" (${job.id}) — was due ${formatIST(new Date(fireAt))}, missed by ${missedBy}`);
    }
  }

  if (promoted > 0) {
    console.log(`[scheduler] Recovery complete: ${promoted} missed job(s) promoted for immediate processing.`);
  } else {
    console.log(`[scheduler] Recovery: ${delayed.length} delayed job(s) found, all still in the future — nothing to promote.`);
  }
}

/**
 * Graceful shutdown — close the queue connection.
 */
async function shutdown() {
  await queue.close();
}

module.exports = { schedule, cancel, list, recover, shutdown, QUEUE_NAME };
