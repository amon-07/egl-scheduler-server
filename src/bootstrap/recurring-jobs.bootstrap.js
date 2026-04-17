const scheduler = require('../core/scheduler');
const log = require('../utils/logger');

const TAG = 'scheduler:recurring';

function parseCsvEnv(value) {
  if (!value) return [];
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

async function ensureRecurringSchedules() {
  const enabled = String(process.env.SCHEDULER_ENABLE_RECURRING || 'true').toLowerCase() === 'true';
  if (!enabled) {
    log.info(TAG, 'Recurring jobs disabled');
    return;
  }

  const tz = process.env.SCHEDULER_RECURRING_TZ || 'Asia/Kolkata';
  const potmCron = process.env.SCHEDULER_POTM_CRON || '0 1 1 * *';         // 1st of month, 01:00
  const globalCron = process.env.SCHEDULER_GLOBAL_LEADERBOARD_CRON || '0 1 * * 0'; // Sunday 01:00

  const potmGameIds = parseCsvEnv(process.env.SCHEDULER_POTM_GAME_IDS);
  const globalGameIds = parseCsvEnv(process.env.SCHEDULER_GLOBAL_LEADERBOARD_GAME_IDS);

  for (const gameId of potmGameIds) {
    await scheduler.scheduleRecurring(
      'potm:recalculate',
      { gameId, month: null, year: null, adminId: null },
      { pattern: potmCron, tz },
      { jobId: `repeat:potm:${gameId}` }
    );
    log.info(TAG, 'POTM recurring registered', { gameId, cron: potmCron, tz });
  }

  for (const gameId of globalGameIds) {
    await scheduler.scheduleRecurring(
      'leaderboard:global-recalculate',
      { gameId, participantType: 'Team', adminId: null, useCustomConfig: false },
      { pattern: globalCron, tz },
      { jobId: `repeat:leaderboard:${gameId}` }
    );
    log.info(TAG, 'Global leaderboard recurring registered', { gameId, cron: globalCron, tz });
  }
}

module.exports = { ensureRecurringSchedules };
