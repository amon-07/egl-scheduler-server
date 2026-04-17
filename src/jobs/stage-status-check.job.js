const { handleStageStatusCheck } = require('../domain/status-automation.domain');
const log = require('../utils/logger');

const JOB_NAME = 'stage:status-check';
const TAG = 'job:stage-status';

module.exports = {
  name: JOB_NAME,

  handler: async (payload = {}) => {
    if (!payload.stageId) {
      throw new Error('stageId is required in payload');
    }

    log.info(TAG, 'Job fired', { stageId: payload.stageId });
    const result = await handleStageStatusCheck({ stageId: payload.stageId });
    log.info(TAG, 'Job result', { stageId: payload.stageId, result });
    return result;
  },

  options: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
  },
};
