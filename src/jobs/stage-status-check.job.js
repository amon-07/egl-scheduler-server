const { handleStageStatusCheck } = require('../domain/status-automation.domain');

const JOB_NAME = 'stage:status-check';

module.exports = {
  name: JOB_NAME,

  handler: async (payload = {}) => {
    if (!payload.stageId) {
      throw new Error('stageId is required in payload');
    }

    console.log(`[job:stage-status] fired at ${new Date().toISOString()} for stageId=${payload.stageId}`);
    const result = await handleStageStatusCheck({ stageId: payload.stageId });
    console.log(`[job:stage-status] result for stageId=${payload.stageId}:`, result);
    return result;
  },

  options: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
  },
};
