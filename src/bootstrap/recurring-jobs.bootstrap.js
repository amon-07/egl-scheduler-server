const scheduler = require('../core/scheduler');

function parseCsvEnv(value) {
  if (!value) return [];
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

async function ensureRecurringSchedules() {
  const enabled = String(process.env.SCHEDULER_ENABLE_RECURRING || 'true').toLowerCase() === 'true';
  if (!enabled) {
    console.log('[scheduler:recurring] disabled');
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
    console.log(`[scheduler:recurring] POTM game=${gameId} cron="${potmCron}" tz=${tz}`);
  }

  for (const gameId of globalGameIds) {
    await scheduler.scheduleRecurring(
      'leaderboard:global-recalculate',
      { gameId, participantType: 'Team', adminId: null, useCustomConfig: false },
      { pattern: globalCron, tz },
      { jobId: `repeat:leaderboard:${gameId}` }
    );
    console.log(`[scheduler:recurring] Global leaderboard game=${gameId} cron="${globalCron}" tz=${tz}`);
  }
}

module.exports = { ensureRecurringSchedules };
