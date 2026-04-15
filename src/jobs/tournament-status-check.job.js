const { handleTournamentStatusCheck } = require('../domain/status-automation.domain');

const JOB_NAME = 'tournament:status-check';

module.exports = {
  name: JOB_NAME,

  handler: async (payload = {}) => {
    if (!payload.tournamentId) {
      throw new Error('tournamentId is required in payload');
    }

    console.log(`[job:tournament-status] fired at ${new Date().toISOString()} for tournamentId=${payload.tournamentId}`);
    const result = await handleTournamentStatusCheck({ tournamentId: payload.tournamentId });
    console.log(`[job:tournament-status] result for tournamentId=${payload.tournamentId}:`, result);
    return result;
  },

  options: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
  },
};
