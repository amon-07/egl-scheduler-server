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
  };

  console.log(`[scheduler] ${replaced ? 'Rescheduled' : 'Scheduled'} "${name}" → fires at ${result.scheduledForIST} (in ${result.delay})`);
  return result;
}

/**
 * Schedule a recurring cron-based job in a specific timezone.
 * This is idempotent when called repeatedly with same name+jobId+pattern.
 */
async function scheduleRecurring(name, data, repeatConfig = {}, opts = {}) {
  if (!registry.has(name)) {
    throw new Error(`Unknown job type: "${name}". Registered types: [${registry.listRegistered().join(', ')}]`);
  }

  const { pattern, tz = 'Asia/Kolkata', startDate } = repeatConfig;
  if (!pattern) {
    throw new Error('repeatConfig.pattern is required for recurring scheduling');
  }

  const jobDef = registry.get(name);
  const jobOptions = {
    ...jobDef.options,
    ...(opts.jobId ? { jobId: opts.jobId } : {}),
    repeat: {
      pattern,
      tz,
      ...(startDate ? { startDate } : {}),
    },
  };

  const job = await queue.add(name, {
    ...data,
    _meta: {
      recurring: true,
      cron: pattern,
      tz,
      scheduledAt: new Date().toISOString(),
    },
  }, jobOptions);

  return {
    jobId: job.id,
    name: job.name,
    repeat: job.opts?.repeat || null,
  };
}

async function listRecurring(limit = 200) {
  const items = await queue.getRepeatableJobs(0, Math.max(0, limit - 1));
  return items.map((item) => ({
    key: item.key,
    name: item.name,
    id: item.id || null,
    pattern: item.pattern || item.cron || null,
    tz: item.tz || null,
    next: item.next || null,
  }));
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
 * Get a job by ID with current queue state.
 *
 * @param {string} jobId
 * @returns {Promise<object|null>}
 */
async function get(jobId) {
  const job = await queue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();
  return {
    id: job.id,
    name: job.name,
    data: job.data,
    state,
    attemptsMade: job.attemptsMade,
    attempts: job.opts?.attempts || 0,
    delay: job.delay || 0,
    scheduledFor: job.data?._meta?.scheduledFor || null,
    timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : null,
  };
}

async function _cancelJobsByPredicate(predicateFn) {
  const jobs = await queue.getJobs(['delayed', 'waiting', 'prioritized', 'paused']);
  let removed = 0;
  for (const job of jobs) {
    try {
      if (predicateFn(job)) {
        await job.remove();
        removed += 1;
      }
    } catch {
      // best effort
    }
  }
  return removed;
}

async function cancelStageStatusJobs(stageId) {
  if (!stageId) return 0;
  const stageIdStr = String(stageId);
  return _cancelJobsByPredicate((job) => job.name === 'stage:status-check' && String(job.data?.stageId) === stageIdStr);
}

async function cancelTournamentStatusJobs(tournamentId) {
  if (!tournamentId) return 0;
  const tournamentIdStr = String(tournamentId);
  return _cancelJobsByPredicate((job) => job.name === 'tournament:status-check' && String(job.data?.tournamentId) === tournamentIdStr);
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

module.exports = {
  schedule,
  scheduleRecurring,
  listRecurring,
  cancel,
  get,
  list,
  cancelStageStatusJobs,
  cancelTournamentStatusJobs,
  recover,
  shutdown,
  QUEUE_NAME,
};
