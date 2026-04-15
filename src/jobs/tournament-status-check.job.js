const { handleTournamentStatusCheck } = require('../domain/status-automation.domain');

const JOB_NAME = 'tournament:status-check';

module.exports = {
  name: JOB_NAME,

  handler: async (payload = {}) => {
    if (!payload.tournamentId) {
      throw new Error('tournamentId is required in payload');
    }

    return handleTournamentStatusCheck({ tournamentId: payload.tournamentId });
  },

  options: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
  },
};
