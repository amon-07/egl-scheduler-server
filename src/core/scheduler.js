/**
 * Scheduler — wrapper around the BullMQ queue.
 *
 * Exposes: schedule (delayed, upsert by jobId), scheduleRecurring (cron),
 * cancel, get, list. That's all the project needs.
 */

const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redis.config');
const registry = require('./registry');
const log = require('../utils/logger');

const TAG = 'scheduler';

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

function toDate(runAt) {
  if (runAt instanceof Date) return runAt;
  if (typeof runAt === 'number') return new Date(runAt);
  const d = new Date(String(runAt));
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid runAt value: ${runAt}`);
  }
  return d;
}

async function schedule(name, data, runAt, { jobId } = {}) {
  if (!registry.has(name)) {
    throw new Error(`Unknown job type: "${name}"`);
  }

  const fireAt = toDate(runAt);
  const delayMs = Math.max(fireAt.getTime() - Date.now(), 0);

  // Upsert: replace any existing job with this id so reschedules take effect.
  let replaced = false;
  if (jobId) {
    const existing = await queue.getJob(jobId);
    if (existing) {
      const prevState = await existing.getState().catch(() => 'unknown');
      await existing.remove();
      replaced = true;
      log.info(TAG, `Replaced existing job`, { jobId, previousState: prevState });
    }
  }

  const { options = {} } = registry.get(name);
  const job = await queue.add(name, {
    ...data,
    _meta: { scheduledFor: fireAt.toISOString() },
  }, {
    ...options,
    delay: delayMs,
    ...(jobId ? { jobId } : {}),
  });

  const verb = replaced ? 'rescheduled' : 'scheduled';
  log.info(TAG, `Job ${verb}: "${name}"`, { jobId: job.id, firesAt: fireAt.toISOString(), delayMs });
  return { jobId: job.id, name, scheduledFor: fireAt.toISOString(), delayMs, replaced };
}

async function scheduleRecurring(name, data, { pattern, tz = 'Asia/Kolkata' }, { jobId } = {}) {
  if (!registry.has(name)) {
    throw new Error(`Unknown job type: "${name}"`);
  }
  if (!pattern) throw new Error('recurring pattern is required');
  if (!jobId) throw new Error('recurring jobId is required');

  await queue.upsertJobScheduler(jobId, { pattern, tz }, { name, data });
  log.info(TAG, `Recurring job upserted: "${name}"`, { jobId, pattern, tz });
  return { jobId, name, pattern, tz };
}

async function cancel(jobId) {
  const job = await queue.getJob(jobId);
  if (!job) return false;
  await job.remove();
  log.info(TAG, 'Job cancelled', { jobId });
  return true;
}

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
    scheduledFor: job.data?._meta?.scheduledFor || null,
    delay: job.delay || 0,
  };
}

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
    state: j.delay > 0 ? 'delayed' : 'waiting',
  }));
}

async function shutdown() {
  await queue.close();
}

module.exports = {
  schedule,
  scheduleRecurring,
  cancel,
  get,
  list,
  shutdown,
  QUEUE_NAME,
};
