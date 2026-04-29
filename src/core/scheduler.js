const mongoose = require('mongoose');
const cronParser = require('cron-parser');
const { createMongoAdapter, createScheduler } = require('bullmq-lazy-scheduler');
const { redisConnection } = require('../config/redis.config');
const log = require('../utils/logger');

const QUEUE_NAME = process.env.SCHEDULER_QUEUE_NAME || 'scheduler';
const registeredJobs = new Set();

let scheduler = null;

function getScheduler() {
  if (scheduler) return scheduler;

  scheduler = createScheduler({
    queueName: QUEUE_NAME,
    redisConnection,
    store: createMongoAdapter({ mongoose }),
    logger: log,
    worker: { concurrency: resolveWorkerConcurrency() },
    defaults: {
      attempts: Number(process.env.SCHEDULER_DEFAULT_ATTEMPTS || 3),
      backoff: { type: 'exponential', delay: Number(process.env.SCHEDULER_BACKOFF_MS || 3000) },
      staleRunningAfterMs: Number(process.env.SCHEDULER_STALE_RUNNING_MS || 10 * 60 * 1000),
      deadLetterOnExhausted: process.env.SCHEDULER_DEAD_LETTER_ON_EXHAUSTED !== 'false',
      reconcileBatchSize: Number(process.env.SCHEDULER_RECONCILE_BATCH_SIZE || 1000),
    },
    locks: {
      keyPrefix: QUEUE_NAME,
      ttlMs: Number(process.env.SCHEDULER_RECONCILE_LOCK_TTL_MS || 30000),
      instanceId: process.env.SCHEDULER_INSTANCE_ID,
    },
  });

  return scheduler;
}

function resolveWorkerConcurrency() {
  const value = process.env.SCHEDULER_WORKER_CONCURRENCY;
  if (!value || value === 'auto') return 'auto';

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 'auto';
}

function register(jobDef) {
  const instance = getScheduler();
  instance.register({
    name: jobDef.name,
    defaultOptions: jobDef.options,
    handler: async (payload = {}, context) => {
      const { __recurring, ...jobPayload } = payload;
      const result = await jobDef.handler(jobPayload, context);

      if (__recurring) {
        scheduleRecurring(
          jobDef.name,
          __recurring.payload || jobPayload,
          { pattern: __recurring.pattern, tz: __recurring.tz },
          { jobId: __recurring.jobId }
        ).catch((error) => {
          log.error('scheduler:recurring', 'Failed to schedule next recurring run', {
            jobName: jobDef.name,
            jobId: __recurring.jobId,
            error: error.message,
          });
        });
      }

      return result;
    },
  });

  registeredJobs.add(jobDef.name);
}

async function start() {
  await getScheduler().start();
  log.info('scheduler', 'Worker started', {
    queueName: QUEUE_NAME,
    registeredJobs: listRegistered(),
  });
}

async function reconcile() {
  const result = await getScheduler().reconcile();
  log.info('scheduler', 'Reconcile finished', result);
  return result;
}

async function schedule(name, payload, runAt, options = {}) {
  const result = await getScheduler().schedule({
    name,
    jobId: options.jobId || `${name}-${Date.now()}`,
    payload: payload || {},
    runAt,
    attempts: options.attempts,
    backoff: options.backoff,
    ttlMs: options.ttlMs,
    replaceExisting: options.replaceExisting,
  });

  log.info('scheduler', 'Job scheduled', {
    jobId: result.jobId,
    name,
    runAt: result.runAt,
    delayMs: result.delayMs,
    action: result.action,
  });

  return {
    jobId: result.jobId,
    name,
    scheduledFor: result.runAt,
    delayMs: result.delayMs,
    replaced: result.action === 'rescheduled',
    action: result.action,
  };
}

async function scheduleRecurring(name, payload, repeat, options = {}) {
  if (!repeat?.pattern) throw new Error('recurring pattern is required');
  if (!options.jobId) throw new Error('recurring jobId is required');

  const runAt = getNextCronRunAt(repeat.pattern, repeat.tz);
  const result = await schedule(
    name,
    {
      ...(payload || {}),
      __recurring: {
        jobId: options.jobId,
        pattern: repeat.pattern,
        tz: repeat.tz,
        payload: payload || {},
      },
    },
    runAt,
    { ...options, jobId: options.jobId }
  );

  return {
    jobId: options.jobId,
    name,
    pattern: repeat.pattern,
    tz: repeat.tz,
    nextRunAt: result.scheduledFor,
  };
}

function getNextCronRunAt(pattern, tz) {
  return cronParser
    .parseExpression(pattern, {
      tz,
      currentDate: new Date(Date.now() + 1000),
    })
    .next()
    .toDate()
    .toISOString();
}

async function cancel(jobId) {
  const result = await getScheduler().cancel(jobId);
  return result.cancelled;
}

function get(jobId) {
  return getScheduler().get(jobId);
}

function list(filter) {
  return getScheduler().list(filter);
}

function listDeadLetters(filter) {
  return getScheduler().listDeadLetters(filter);
}

async function shutdown() {
  if (!scheduler) return;
  await scheduler.shutdown();
  scheduler = null;
}

function listRegistered() {
  return [...registeredJobs];
}

module.exports = {
  QUEUE_NAME,
  register,
  start,
  reconcile,
  schedule,
  scheduleRecurring,
  cancel,
  get,
  list,
  listDeadLetters,
  shutdown,
  listRegistered,
};
