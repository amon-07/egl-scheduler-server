const Tournament = require('../models/tournament.model');
const Stage = require('../models/stage.model');
const StageRegistration = require('../models/stage-registration.model');
const scheduler = require('../core/scheduler');
const cacheInvalidation = require('../utils/cache-invalidation.utils');
const log = require('../utils/logger');
const {
  TOURNAMENT_STATUS,
  STAGE_STATUS,
  REGISTRATION_STATUS,
} = require('../constants/status.constants');

async function handleTournamentStatusCheck({ tournamentId }) {
  log.info('domain:tournament-status', 'Evaluating tournament status', { tournamentId });
  const now = new Date();
  const tournament = await Tournament.findById(tournamentId)
    .select('status startDate endDate')
    .lean();

  if (!tournament) return { tournamentId, action: 'skipped', reason: 'not_found' };

  if ([TOURNAMENT_STATUS.COMPLETED, TOURNAMENT_STATUS.DELETED].includes(tournament.status)) {
    return { tournamentId, action: 'skipped', reason: 'terminal_status' };
  }

  const start = new Date(tournament.startDate);
  const end = new Date(tournament.endDate);
  let newStatus = null;

  if (now > end) {
    newStatus = TOURNAMENT_STATUS.COMPLETED;
  } else if (now >= start && now <= end) {
    newStatus = TOURNAMENT_STATUS.OPEN;
  } else if (now < start && tournament.status === TOURNAMENT_STATUS.DRAFT) {
    newStatus = TOURNAMENT_STATUS.UPCOMING;
  }

  if (newStatus && newStatus !== tournament.status) {
    await Tournament.updateOne({ _id: tournamentId }, { $set: { status: newStatus } });
    log.info('domain:tournament-status', 'Tournament status updated', { tournamentId, from: tournament.status, to: newStatus });
    return { tournamentId, action: 'updated', from: tournament.status, to: newStatus };
  }

  log.debug('domain:tournament-status', 'No status change', { tournamentId, current: tournament.status });
  return { tournamentId, action: 'no_change' };
}

function deriveStageStatus(stage, now) {
  const stageStart = new Date(stage.startDate);
  const stageEnd = new Date(stage.endDate);
  const regStart = new Date(stage.registrationWindowStart);
  const regEnd = new Date(stage.registrationWindowEnd);
  const maxTeams = Number(stage.maxTeamsAllowedForRegistration || 0);
  const registered = Number(stage.registeredTeamCount || 0);
  const waitListMax = Number(stage.waitListAllowedForRegistration || 0);
  const waitListCount = Number(stage.waitingListTeamCount || 0);
  const mainSlotsFull = maxTeams > 0 && registered >= maxTeams;
  const waitListFull = waitListMax <= 0 || waitListCount >= waitListMax;

  if (now > stageEnd) return STAGE_STATUS.COMPLETED;
  if (now >= stageStart && now <= stageEnd) return STAGE_STATUS.IN_PROGRESS;

  // Sticky FILLED: once stage becomes FILLED, keep it FILLED until actual stage start.
  if (stage.status === STAGE_STATUS.FILLED && now < stageStart) return STAGE_STATUS.FILLED;

  if (mainSlotsFull && waitListFull) return STAGE_STATUS.FILLED;

  if (now >= regStart && now <= regEnd) return STAGE_STATUS.OPEN;

  if (stage.isPreRegistrationAllowed && stage.preRegistrationWindowStart && stage.preRegistrationWindowEnd) {
    const preStart = new Date(stage.preRegistrationWindowStart);
    const preEnd = new Date(stage.preRegistrationWindowEnd);

    if (now >= preStart && now <= preEnd) return STAGE_STATUS.PRE_REGISTRATION_OPEN;
    if (now > preEnd && now < regStart) return STAGE_STATUS.PRE_REGISTRATION_CLOSED;
  }

  // Registration closed but stage not started yet.
  if (now > regEnd && now < stageStart) {
    return mainSlotsFull && waitListFull ? STAGE_STATUS.FILLED : STAGE_STATUS.UPCOMING;
  }

  return STAGE_STATUS.UPCOMING;
}

function getNextStageRunAt(stage, now = new Date()) {
  const boundaries = [
    stage.preRegistrationWindowStart,
    stage.preRegistrationWindowEnd,
    stage.registrationWindowStart,
    stage.registrationWindowEnd,
    stage.startDate,
    stage.endDate,
  ]
    .map((value) => (value ? new Date(value) : null))
    .filter((d) => d && !Number.isNaN(d.getTime()) && d.getTime() > now.getTime() + 500)
    .sort((a, b) => a.getTime() - b.getTime());

  if (!boundaries.length) return null;
  return boundaries[0].toISOString();
}

async function runStageSideEffects(updatedStage, { previousStatus }) {
  const stageId = String(updatedStage._id);
  const tournamentId = updatedStage.tournamentId ? String(updatedStage.tournamentId) : null;
  const nowPlusOneSecond = new Date(Date.now() + 1000).toISOString();

  await Promise.allSettled([
    cacheInvalidation.deleteByPatternAndPublish('stages:all:*'),
    tournamentId ? cacheInvalidation.delAndPublish([`roadmap:${tournamentId}`]) : Promise.resolve(0),
  ]);

  if (tournamentId) {
    await Promise.allSettled([
      scheduler.schedule(
        'tournament:status-check',
        { tournamentId, reason: 'stage_status_chain', requestedBy: 'scheduler_domain' },
        nowPlusOneSecond,
        { jobId: `tournament-status-${tournamentId}` }
      ),
    ]);
  }

  const terminalStatuses = [STAGE_STATUS.COMPLETED, STAGE_STATUS.DELETED, STAGE_STATUS.POSTPONED];
  if (terminalStatuses.includes(updatedStage.status)) {
    await scheduler.cancel(`stage-status-${stageId}`).catch(() => {});
    return;
  }

  const nextRunAt = getNextStageRunAt(updatedStage);
  if (!nextRunAt) return;

  // Only chain when a real status transition happened.
  if (previousStatus !== updatedStage.status) {
    await scheduler.schedule(
      'stage:status-check',
      { stageId, reason: 'stage_status_chain', requestedBy: 'scheduler_domain' },
      nextRunAt,
      { jobId: `stage-status-${stageId}` }
    );
  }
}

async function handleStageStatusCheck({ stageId }) {
  log.info('domain:stage-status', 'Evaluating stage status', { stageId });
  const now = new Date();
  const stage = await Stage.findById(stageId)
    .select('status startDate endDate registrationWindowStart registrationWindowEnd '
      + 'isPreRegistrationAllowed preRegistrationWindowStart preRegistrationWindowEnd '
      + 'registeredTeamCount maxTeamsAllowedForRegistration waitingListTeamCount waitListAllowedForRegistration')
    .lean();

  if (!stage) return { stageId, action: 'skipped', reason: 'not_found' };

  if ([STAGE_STATUS.COMPLETED, STAGE_STATUS.DELETED].includes(stage.status)) {
    log.debug('domain:stage-status', 'Skipped terminal stage', { stageId, status: stage.status });
    return { stageId, action: 'skipped', reason: 'terminal_status' };
  }

  const newStatus = deriveStageStatus(stage, now);
  if (!newStatus || newStatus === stage.status) {
    log.debug('domain:stage-status', 'No status change', { stageId, current: stage.status });
    return { stageId, action: 'no_change' };
  }

  await Stage.updateOne(
    { _id: stageId },
    { $set: { status: newStatus, 'audit.updatedByAdminId': null, 'audit.updateReason': 'AUTOMATION_STATUS_UPDATE' } }
  );

  const refreshedStage = await Stage.findById(stageId)
    .select('_id tournamentId status startDate endDate registrationWindowStart registrationWindowEnd '
      + 'isPreRegistrationAllowed preRegistrationWindowStart preRegistrationWindowEnd')
    .lean();

  if (refreshedStage) {
    await runStageSideEffects(refreshedStage, { previousStatus: stage.status });
  }

  if (newStatus === STAGE_STATUS.COMPLETED) {
    const bulkResult = await StageRegistration.updateMany(
      { stageId, status: REGISTRATION_STATUS.PENDING },
      {
        $set: {
          status: REGISTRATION_STATUS.REJECTED,
          rejectedAt: now,
          rejectedReason: 'Stage completed - auto-rejected.',
        },
      }
    );

    return {
      stageId,
      action: 'completed',
      from: stage.status,
      to: newStatus,
      pendingRejected: bulkResult.modifiedCount,
    };
  }

  log.info('domain:stage-status', 'Stage status updated', { stageId, from: stage.status, to: newStatus });
  return { stageId, action: 'updated', from: stage.status, to: newStatus };
}

module.exports = {
  handleTournamentStatusCheck,
  handleStageStatusCheck,
  deriveStageStatus,
};
