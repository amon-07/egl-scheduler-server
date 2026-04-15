const mongoose = require('mongoose');

const StageSchema = new mongoose.Schema(
  {
    tournamentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    status: { type: String, required: true },

    startDate: { type: Date },
    endDate: { type: Date },
    registrationWindowStart: { type: Date },
    registrationWindowEnd: { type: Date },

    isPreRegistrationAllowed: { type: Boolean, default: false },
    preRegistrationWindowStart: { type: Date },
    preRegistrationWindowEnd: { type: Date },

    registeredTeamCount: { type: Number, default: 0 },
    maxTeamsAllowedForRegistration: { type: Number, default: 0 },
    waitingListTeamCount: { type: Number, default: 0 },
    waitListAllowedForRegistration: { type: Number, default: 0 },
  },
  {
    strict: false,
  }
);

module.exports = mongoose.models.SchedulerStage || mongoose.model('SchedulerStage', StageSchema, 'tournament_stages');
