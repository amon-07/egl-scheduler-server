const mongoose = require('mongoose');
const { createMongoAdapter, createScheduler } = require('bullmq-lazy-scheduler');
const { redisConnection } = require('./config/redis.config');
const log = require('./utils/logger');

let scheduler = null;

function instance() {
  if (!scheduler) {
    scheduler = createScheduler({
      queueName: process.env.SCHEDULER_QUEUE_NAME || 'scheduler',
      redisConnection,
      store: createMongoAdapter({ mongoose }),
      logger: log,
      worker: { concurrency: parseConcurrency(process.env.SCHEDULER_WORKER_CONCURRENCY) },
      defaults: {
        attempts: Number(process.env.SCHEDULER_DEFAULT_ATTEMPTS || 3),
        backoff: { type: 'exponential', delay: Number(process.env.SCHEDULER_BACKOFF_MS || 3000) },
        staleRunningAfterMs: Number(process.env.SCHEDULER_STALE_RUNNING_MS || 10 * 60 * 1000),
        deadLetterOnExhausted: process.env.SCHEDULER_DEAD_LETTER_ON_EXHAUSTED !== 'false',
        reconcileBatchSize: Number(process.env.SCHEDULER_RECONCILE_BATCH_SIZE || 1000),
      },
      locks: {
        keyPrefix: process.env.SCHEDULER_QUEUE_NAME || 'scheduler',
        ttlMs: Number(process.env.SCHEDULER_RECONCILE_LOCK_TTL_MS || 30000),
        instanceId: process.env.SCHEDULER_INSTANCE_ID,
      },
    });
  }

  return scheduler;
}

function parseConcurrency(value) {
  if (!value || value === 'auto') return 'auto';
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 'auto';
}

function parseCsvEnv(value) {
  if (!value) return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function register(jobDef) {
  instance().register({
    name: jobDef.name,
    handler: jobDef.handler,
    defaultOptions: jobDef.options,
  });
}

async function schedule(name, payload, runAt, options = {}) {
  const result = await instance().schedule({
    name,
    jobId: options.jobId || `${name}-${Date.now()}`,
    payload: payload || {},
    runAt,
    attempts: options.attempts,
    backoff: options.backoff,
    ttlMs: options.ttlMs,
    replaceExisting: options.replaceExisting,
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

function scheduleRecurring(name, payload, repeat, options = {}) {
  return instance().scheduleRecurring({
    name,
    jobId: options.jobId,
    payload: payload || {},
    pattern: repeat?.pattern,
    tz: repeat?.tz,
    attempts: options.attempts,
    backoff: options.backoff,
    ttlMs: options.ttlMs,
    replaceExisting: options.replaceExisting,
  });
}

async function ensureRecurringSchedules() {
  const enabled = String(process.env.SCHEDULER_ENABLE_RECURRING || 'true').toLowerCase() === 'true';
  if (!enabled) {
    log.info('scheduler:recurring', 'Recurring jobs disabled');
    return;
  }

  const tz = process.env.SCHEDULER_RECURRING_TZ || 'Asia/Kolkata';
  const potmCron = process.env.SCHEDULER_POTM_CRON || '0 1 1 * *';
  const globalCron = process.env.SCHEDULER_GLOBAL_LEADERBOARD_CRON || '0 1 * * 0';

  for (const gameId of parseCsvEnv(process.env.SCHEDULER_POTM_GAME_IDS)) {
    await scheduleRecurring(
      'potm:recalculate',
      { gameId, month: null, year: null, adminId: null },
      { pattern: potmCron, tz },
      { jobId: `repeat-potm-${gameId}` }
    );
    log.info('scheduler:recurring', 'POTM recurring registered', { gameId, cron: potmCron, tz });
  }

  for (const gameId of parseCsvEnv(process.env.SCHEDULER_GLOBAL_LEADERBOARD_GAME_IDS)) {
    await scheduleRecurring(
      'leaderboard:global-recalculate',
      { gameId, participantType: 'Team', adminId: null, useCustomConfig: false },
      { pattern: globalCron, tz },
      { jobId: `repeat-leaderboard-${gameId}` }
    );
    log.info('scheduler:recurring', 'Global leaderboard recurring registered', { gameId, cron: globalCron, tz });
  }
}

async function cancel(jobId) {
  const result = await instance().cancel(jobId);
  return result.cancelled;
}

async function shutdown() {
  if (!scheduler) return;
  await scheduler.shutdown();
  scheduler = null;
}

module.exports = {
  register,
  start: () => instance().start(),
  reconcile: () => instance().reconcile(),
  schedule,
  scheduleRecurring,
  ensureRecurringSchedules,
  cancel,
  get: (jobId) => instance().get(jobId),
  list: (filter) => instance().list(filter),
  listDeadLetters: (filter) => instance().listDeadLetters(filter),
  shutdown,
  listRegistered: () => (scheduler ? scheduler.listRegistered() : []),
};
