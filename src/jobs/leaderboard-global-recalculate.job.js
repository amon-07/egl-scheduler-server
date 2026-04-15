const { runGlobalLeaderboardRecalculation } = require('../integrations/admin-backend.client');

module.exports = {
  name: 'leaderboard:global-recalculate',

  handler: async (payload = {}) => {
    const { gameId, participantType = 'Team', useCustomConfig = false } = payload;
    if (!gameId) {
      throw new Error('gameId is required in payload');
    }

    const response = await runGlobalLeaderboardRecalculation({
      gameId,
      participantType,
      useCustomConfig,
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

