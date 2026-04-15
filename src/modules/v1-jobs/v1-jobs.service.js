const scheduler = require('../../core/scheduler');

const Tournament = require('../../models/tournament.model');
const Stage = require('../../models/stage.model');
const { TOURNAMENT_STATUS, STAGE_STATUS } = require('../../constants/status.constants');
const cacheInvalidation = require('../../utils/cache-invalidation.utils');

function normalizeRunAt(runAt) {
  const parsed = runAt ? new Date(runAt) : new Date(Date.now() + 1000);
  if (Number.isNaN(parsed.getTime())) {
    throw Object.assign(new Error('runAt must be a valid ISO-8601 datetime.'), { status: 400, code: 'SCH400' });
  }
  return parsed.toISOString();
}

async function scheduleDeterministicJob({ jobName, jobId, payload, runAt }) {
  const normalizedRunAt = normalizeRunAt(runAt);
  const delayMs = new Date(normalizedRunAt).getTime() - Date.now();

  if (delayMs <= 0) {
    const cancelled = await scheduler.cancel(jobId);
    return {
      status: 'ok',
      action: 'cancelled_negative_delay',
      jobId,
      runAt: normalizedRunAt,
      delayMs,
      cancelled,
    };
  }

  const result = await scheduler.schedule(jobName, payload, normalizedRunAt, { jobId });
  return {
    status: 'ok',
    action: 'scheduled',
    jobId: result.jobId,
    runAt: result.scheduledFor,
    delayMs: result.delayMs,
  };
}

function createV1JobsService() {
  async function scheduleStageStatus({ stageId, runAt, reason, requestedBy }) {
    if (!stageId) throw Object.assign(new Error('stageId is required.'), { status: 400, code: 'SCH400' });

    const stage = await Stage.findById(stageId).select('_id status tournamentId').lean();
    if (!stage) {
      return { status: 'ok', action: 'skipped_not_found', jobId: `stage-status:${stageId}` };
    }

    const jobId = `stage-status:${stageId}`;

    if ([STAGE_STATUS.DELETED, STAGE_STATUS.POSTPONED, STAGE_STATUS.COMPLETED].includes(stage.status)) {
      const cancelled = await scheduler.cancel(jobId).catch(() => false);
      await Promise.allSettled([
        cacheInvalidation.deleteByPatternAndPublish('stages:all:*'),
        stage.tournamentId ? cacheInvalidation.delAndPublish([`roadmap:${String(stage.tournamentId)}`]) : Promise.resolve(0),
      ]);
      return {
        status: 'ok',
        action: 'cancelled_terminal_stage',
        jobId,
        cancelled,
        stageStatus: stage.status,
      };
    }

    return scheduleDeterministicJob({
      jobName: 'stage:status-check',
      jobId,
      payload: { stageId, reason, requestedBy },
      runAt,
    });
  }

  async function scheduleTournamentStatus({ tournamentId, runAt, reason, requestedBy }) {
    if (!tournamentId) throw Object.assign(new Error('tournamentId is required.'), { status: 400, code: 'SCH400' });

    const tournament = await Tournament.findById(tournamentId).select('_id status').lean();
    if (!tournament) {
      return { status: 'ok', action: 'skipped_not_found', jobId: `tournament-status:${tournamentId}` };
    }

    const jobId = `tournament-status:${tournamentId}`;

    if ([TOURNAMENT_STATUS.DELETED, TOURNAMENT_STATUS.COMPLETED].includes(tournament.status)) {
      const cancelled = await scheduler.cancel(jobId).catch(() => false);
      return {
        status: 'ok',
        action: 'cancelled_terminal_tournament',
        jobId,
        cancelled,
        tournamentStatus: tournament.status,
      };
    }

    return scheduleDeterministicJob({
      jobName: 'tournament:status-check',
      jobId,
      payload: { tournamentId, reason, requestedBy },
      runAt,
    });
  }

  async function scheduleBulkStatusSync({ runAt }) {
    const normalizedRunAt = normalizeRunAt(runAt);

    const [tournaments, stages] = await Promise.all([
      Tournament.find({ status: { $nin: [TOURNAMENT_STATUS.COMPLETED, TOURNAMENT_STATUS.DELETED] } }).select('_id').lean(),
      Stage.find({ status: { $nin: [STAGE_STATUS.COMPLETED, STAGE_STATUS.DELETED] } }).select('_id').lean(),
    ]);

    const tournamentResults = await Promise.allSettled(
      tournaments.map((t) => scheduleTournamentStatus({
        tournamentId: String(t._id),
        runAt: normalizedRunAt,
        reason: 'bulk_status_sync',
        requestedBy: 'scheduler_bulk_sync',
      }))
    );

    const stageResults = await Promise.allSettled(
      stages.map((s) => scheduleStageStatus({
        stageId: String(s._id),
        runAt: normalizedRunAt,
        reason: 'bulk_status_sync',
        requestedBy: 'scheduler_bulk_sync',
      }))
    );

    function summarize(results) {
      return results.reduce((acc, item) => {
        if (item.status === 'fulfilled') {
          if (item.value?.action === 'scheduled') acc.scheduled += 1;
          if (item.value?.action === 'cancelled_negative_delay') acc.cancelled += 1;
        } else {
          acc.failed += 1;
        }
        return acc;
      }, { scheduled: 0, cancelled: 0, failed: 0 });
    }

    return {
      status: 'ok',
      runAt: normalizedRunAt,
      tournaments: { total: tournaments.length, ...summarize(tournamentResults) },
      stages: { total: stages.length, ...summarize(stageResults) },
    };
  }

  async function scheduleLeaderboardGlobal({ gameId, runAt, participantType = 'Team', adminId = null, useCustomConfig = false }) {
    if (!gameId) throw Object.assign(new Error('gameId is required.'), { status: 400, code: 'SCH400' });
    if (!['Team', 'User'].includes(participantType)) {
      throw Object.assign(new Error('participantType must be Team or User.'), { status: 400, code: 'SCH400' });
    }

    return scheduleDeterministicJob({
      jobName: 'leaderboard:global-recalculate',
      jobId: `leaderboard-global:${gameId}:${participantType}`,
      payload: { gameId, participantType, adminId, useCustomConfig: Boolean(useCustomConfig) },
      runAt,
    });
  }

  async function schedulePotmRecalculate({ gameId, runAt, month = null, year = null, adminId = null }) {
    if (!gameId) throw Object.assign(new Error('gameId is required.'), { status: 400, code: 'SCH400' });

    const normalizedMonth = month === null || month === undefined ? null : Number(month);
    const normalizedYear = year === null || year === undefined ? null : Number(year);

    if (normalizedMonth !== null && (!Number.isInteger(normalizedMonth) || normalizedMonth < 1 || normalizedMonth > 12)) {
      throw Object.assign(new Error('month must be an integer between 1 and 12.'), { status: 400, code: 'SCH400' });
    }
    if (normalizedYear !== null && (!Number.isInteger(normalizedYear) || normalizedYear < 2020 || normalizedYear > 2100)) {
      throw Object.assign(new Error('year must be an integer between 2020 and 2100.'), { status: 400, code: 'SCH400' });
    }

    const monthKey = normalizedMonth ?? 'auto';
    const yearKey = normalizedYear ?? 'auto';

    return scheduleDeterministicJob({
      jobName: 'potm:recalculate',
      jobId: `potm-recalculate:${gameId}:${monthKey}:${yearKey}`,
      payload: { gameId, month: normalizedMonth, year: normalizedYear, adminId },
      runAt,
    });
  }

  async function cancelJob(jobId) {
    if (!jobId) throw Object.assign(new Error('jobId is required.'), { status: 400, code: 'SCH400' });
    const cancelled = await scheduler.cancel(jobId);
    return { status: 'ok', cancelled, jobId };
  }

  async function getJob(jobId) {
    if (!jobId) throw Object.assign(new Error('jobId is required.'), { status: 400, code: 'SCH400' });
    const job = await scheduler.get(jobId);
    if (!job) return { status: 'ok', found: false, jobId };
    return { status: 'ok', found: true, job };
  }

  return {
    scheduleStageStatus,
    scheduleTournamentStatus,
    scheduleBulkStatusSync,
    scheduleLeaderboardGlobal,
    schedulePotmRecalculate,
    cancelJob,
    getJob,
  };
}

module.exports = createV1JobsService;
