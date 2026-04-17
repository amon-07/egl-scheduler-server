const { runPotmRecalculation } = require('../integrations/admin-backend.client');
const log = require('../utils/logger');

const TAG = 'job:potm-recalculate';

module.exports = {
  name: 'potm:recalculate',

  handler: async (payload = {}) => {
    const { gameId, month = null, year = null } = payload;
    if (!gameId) {
      throw new Error('gameId is required in payload');
    }

    log.info(TAG, 'Calling admin backend for POTM recalculation', { gameId, month, year });
    const start = Date.now();
    const response = await runPotmRecalculation({ gameId, month, year });
    log.info(TAG, 'Admin backend POTM recalculation completed', {
      gameId,
      month,
      year,
      durationMs: Date.now() - start,
      responseStatus: response?.status,
    });

    return {
      gameId,
      month,
      year,
      response,
    };
  },

  options: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
};

