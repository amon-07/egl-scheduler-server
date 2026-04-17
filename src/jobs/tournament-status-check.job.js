const { handleTournamentStatusCheck } = require('../domain/status-automation.domain');
const log = require('../utils/logger');

const JOB_NAME = 'tournament:status-check';
const TAG = 'job:tournament-status';

module.exports = {
  name: JOB_NAME,

  handler: async (payload = {}) => {
    if (!payload.tournamentId) {
      throw new Error('tournamentId is required in payload');
    }

    log.info(TAG, 'Job fired', { tournamentId: payload.tournamentId });
    const result = await handleTournamentStatusCheck({ tournamentId: payload.tournamentId });
    log.info(TAG, 'Job result', { tournamentId: payload.tournamentId, result });
    return result;
  },

  options: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
  },
};
