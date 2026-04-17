const { runGlobalLeaderboardRecalculation } = require('../integrations/admin-backend.client');
const log = require('../utils/logger');

const TAG = 'job:leaderboard-global';

module.exports = {
  name: 'leaderboard:global-recalculate',

  handler: async (payload = {}) => {
    const { gameId, participantType = 'Team', useCustomConfig = false } = payload;
    if (!gameId) {
      throw new Error('gameId is required in payload');
    }

    log.info(TAG, 'Calling admin backend for global leaderboard recalculation', {
      gameId,
      participantType,
      useCustomConfig,
    });
    const start = Date.now();
    const response = await runGlobalLeaderboardRecalculation({
      gameId,
      participantType,
      useCustomConfig,
    });
    log.info(TAG, 'Admin backend global leaderboard recalculation completed', {
      gameId,
      participantType,
      durationMs: Date.now() - start,
      responseStatus: response?.status,
    });

    return {
      gameId,
      participantType,
      response,
    };
  },

  options: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
};

