const express = require('express');
const { verifySchedulerHmac } = require('../../middleware/hmac.middleware');
const createV1JobsService = require('./v1-jobs.service');
const createV1JobsController = require('./v1-jobs.controller');

const v1JobsService = createV1JobsService();
const v1JobsController = createV1JobsController({ v1JobsService });

const router = express.Router();

router.use(verifySchedulerHmac);

router.put('/stage-status/:stageId', v1JobsController.putStageStatus);
router.put('/tournament-status/:tournamentId', v1JobsController.putTournamentStatus);
router.put('/leaderboard/global/:gameId', v1JobsController.putLeaderboardGlobal);
router.put('/potm/recalculate/:gameId', v1JobsController.putPotmRecalculate);
router.post('/status-sync/bulk', v1JobsController.postBulkStatusSync);
router.delete('/:jobId', v1JobsController.deleteJob);
router.get('/:jobId', v1JobsController.getJob);

module.exports = router;
