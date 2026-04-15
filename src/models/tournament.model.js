const mongoose = require('mongoose');

const TournamentSchema = new mongoose.Schema(
  {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, required: true },
  },
  {
    strict: false,
  }
);

module.exports = mongoose.models.SchedulerTournament || mongoose.model('SchedulerTournament', TournamentSchema, 'tournaments');
