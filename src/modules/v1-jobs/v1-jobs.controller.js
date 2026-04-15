function createV1JobsController({ v1JobsService }) {
  async function putStageStatus(req, res) {
    try {
      const { stageId } = req.params;
      const { runAt, reason, requestedBy } = req.body || {};
      const result = await v1JobsService.scheduleStageStatus({ stageId, runAt, reason, requestedBy });
      return res.status(200).json(result);
    } catch (error) {
      const status = error.status || 500;
      return res.status(status).json({
        status: 'error',
        message: error.message || 'Failed to schedule stage status job.',
        error: { code: error.code || 'SCH500' },
      });
    }
  }

  async function putTournamentStatus(req, res) {
    try {
      const { tournamentId } = req.params;
      const { runAt, reason, requestedBy } = req.body || {};
      const result = await v1JobsService.scheduleTournamentStatus({ tournamentId, runAt, reason, requestedBy });
      return res.status(200).json(result);
    } catch (error) {
      const status = error.status || 500;
      return res.status(status).json({
        status: 'error',
        message: error.message || 'Failed to schedule tournament status job.',
        error: { code: error.code || 'SCH500' },
      });
    }
  }

  async function putLeaderboardGlobal(req, res) {
    try {
      const { gameId } = req.params;
      const { runAt, participantType, adminId, useCustomConfig } = req.body || {};
      const result = await v1JobsService.scheduleLeaderboardGlobal({
        gameId,
        runAt,
        participantType,
        adminId,
        useCustomConfig,
      });
      return res.status(200).json(result);
    } catch (error) {
      const status = error.status || 500;
      return res.status(status).json({
        status: 'error',
        message: error.message || 'Failed to schedule global leaderboard job.',
        error: { code: error.code || 'SCH500' },
      });
    }
  }

  async function putPotmRecalculate(req, res) {
    try {
      const { gameId } = req.params;
      const { runAt, month, year, adminId } = req.body || {};
      const result = await v1JobsService.schedulePotmRecalculate({
        gameId,
        runAt,
        month,
        year,
        adminId,
      });
      return res.status(200).json(result);
    } catch (error) {
      const status = error.status || 500;
      return res.status(status).json({
        status: 'error',
        message: error.message || 'Failed to schedule POTM recalculate job.',
        error: { code: error.code || 'SCH500' },
      });
    }
  }

  async function postBulkStatusSync(req, res) {
    try {
      const { runAt } = req.body || {};
      const result = await v1JobsService.scheduleBulkStatusSync({ runAt });
      return res.status(200).json(result);
    } catch (error) {
      const status = error.status || 500;
      return res.status(status).json({
        status: 'error',
        message: error.message || 'Failed to schedule bulk status sync.',
        error: { code: error.code || 'SCH500' },
      });
    }
  }

  async function deleteJob(req, res) {
    try {
      const result = await v1JobsService.cancelJob(req.params.jobId);
      return res.status(200).json(result);
    } catch (error) {
      const status = error.status || 500;
      return res.status(status).json({
        status: 'error',
        message: error.message || 'Failed to cancel job.',
        error: { code: error.code || 'SCH500' },
      });
    }
  }

  async function getJob(req, res) {
    try {
      const result = await v1JobsService.getJob(req.params.jobId);
      return res.status(200).json(result);
    } catch (error) {
      const status = error.status || 500;
      return res.status(status).json({
        status: 'error',
        message: error.message || 'Failed to fetch job.',
        error: { code: error.code || 'SCH500' },
      });
    }
  }

  return {
    putStageStatus,
    putTournamentStatus,
    putLeaderboardGlobal,
    putPotmRecalculate,
    postBulkStatusSync,
    deleteJob,
    getJob,
  };
}

module.exports = createV1JobsController;
