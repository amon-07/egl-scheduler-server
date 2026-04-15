const { runPotmRecalculation } = require('../integrations/admin-backend.client');

module.exports = {
  name: 'potm:recalculate',

  handler: async (payload = {}) => {
    const { gameId, month = null, year = null } = payload;
    if (!gameId) {
      throw new Error('gameId is required in payload');
    }

    const response = await runPotmRecalculation({ gameId, month, year });

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

