const scheduler = require('../core/scheduler');
const Tournament = require('../models/tournament.model');

function parseCsvEnv(value) {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const isDebug = String(process.env.NODE_ENV || '').toLowerCase() === 'development'
  || String(process.env.SCHEDULER_DEBUG || 'false').toLowerCase() === 'true';

function debugLog(message, meta = null) {
  if (!isDebug) return;
  if (meta) {
    console.log(`[scheduler:recurring:debug] ${message}`, meta);
    return;
  }
  console.log(`[scheduler:recurring:debug] ${message}`);
}

async function resolveGameIdsFromBusinessData() {
  const ids = await Tournament.distinct('gameId', {
    gameId: { $exists: true, $ne: null },
    status: { $nin: ['deleted'] },
  });

  return ids
    .map((id) => (typeof id === 'string' ? id.trim() : String(id || '').trim()))
    .filter(Boolean);
}

function hasRepeatJob(repeatJobs, { name, jobId, pattern, tz }) {
  return repeatJobs.some((job) =>
    job.name === name
    && String(job.id || '') === String(jobId || '')
    && String(job.pattern || '') === String(pattern || '')
    && String(job.tz || '') === String(tz || '')
    && Number(job.next || 0) > 0);
}

async function ensureRecurringSchedules() {
  const enabled = String(process.env.SCHEDULER_ENABLE_RECURRING || 'true').toLowerCase() === 'true';
  if (!enabled) {
    console.log('[scheduler:recurring] disabled via SCHEDULER_ENABLE_RECURRING=false');
    return;
  }

  const tz = process.env.SCHEDULER_RECURRING_TZ || 'Asia/Kolkata';
  const potmCron = process.env.SCHEDULER_POTM_CRON || '0 1 1 * *'; // 1st day, 01:00
  const globalCron = process.env.SCHEDULER_GLOBAL_LEADERBOARD_CRON || '0 1 * * 0'; // Sunday 01:00

  const potmGameIds = parseCsvEnv(process.env.SCHEDULER_POTM_GAME_IDS);
  const globalGameIds = parseCsvEnv(process.env.SCHEDULER_GLOBAL_LEADERBOARD_GAME_IDS);
  const discoveredGameIds = await resolveGameIdsFromBusinessData();
  const effectivePotmGameIds = [...new Set([...(potmGameIds.length ? potmGameIds : discoveredGameIds)])];
  const effectiveGlobalGameIds = [...new Set([...(globalGameIds.length ? globalGameIds : discoveredGameIds)])];

  if (!effectivePotmGameIds.length) {
    console.log('[scheduler:recurring] no POTM gameIds found (set SCHEDULER_POTM_GAME_IDS or ensure tournaments.gameId exists)');
  }
  if (!effectiveGlobalGameIds.length) {
    console.log('[scheduler:recurring] no global leaderboard gameIds found (set SCHEDULER_GLOBAL_LEADERBOARD_GAME_IDS or ensure tournaments.gameId exists)');
  }

  const repeatJobs = await scheduler.listRecurring(500);
  debugLog('loaded repeatable jobs', {
    count: repeatJobs.length,
    jobs: repeatJobs.map((j) => ({ name: j.name, id: j.id, pattern: j.pattern, tz: j.tz, next: j.next })),
  });

  debugLog('effective game id sets', {
    fromEnv: { potmGameIds, globalGameIds },
    discoveredGameIds,
    effective: {
      potm: effectivePotmGameIds,
      global: effectiveGlobalGameIds,
    },
  });

  for (const gameId of effectivePotmGameIds) {
    const jobId = `repeat:potm-recalculate:${gameId}`;
    const exists = hasRepeatJob(repeatJobs, {
      name: 'potm:recalculate',
      jobId,
      pattern: potmCron,
      tz,
    });
    if (!exists) {
      await scheduler.scheduleRecurring(
        'potm:recalculate',
        { gameId, month: null, year: null, adminId: null },
        { pattern: potmCron, tz },
        { jobId }
      );
      console.log(`[scheduler:recurring] POTM scheduled for game=${gameId} cron="${potmCron}" tz=${tz}`);
    } else {
      debugLog(`POTM recurring already healthy for game=${gameId} (next exists)`);
    }
  }

  for (const gameId of effectiveGlobalGameIds) {
    const jobId = `repeat:leaderboard-global:${gameId}:Team`;
    const exists = hasRepeatJob(repeatJobs, {
      name: 'leaderboard:global-recalculate',
      jobId,
      pattern: globalCron,
      tz,
    });
    if (!exists) {
      await scheduler.scheduleRecurring(
        'leaderboard:global-recalculate',
        { gameId, participantType: 'Team', adminId: null, useCustomConfig: false },
        { pattern: globalCron, tz },
        { jobId }
      );
      console.log(`[scheduler:recurring] Global leaderboard scheduled for game=${gameId} cron="${globalCron}" tz=${tz}`);
    } else {
      debugLog(`Global recurring already healthy for game=${gameId} (next exists)`);
    }
  }
}

module.exports = {
  ensureRecurringSchedules,
};
