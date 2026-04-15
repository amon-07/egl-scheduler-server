const mongoose = require('mongoose');

const StageRegistrationSchema = new mongoose.Schema(
  {
    stageId: { type: mongoose.Schema.Types.ObjectId, required: true },
    status: { type: String, required: true },
    rejectedAt: { type: Date },
    rejectedReason: { type: String },
  },
  {
    strict: false,
  }
);

module.exports =
  mongoose.models.SchedulerStageRegistration
  || mongoose.model('SchedulerStageRegistration', StageRegistrationSchema, 'tournament_stage_registrations');
