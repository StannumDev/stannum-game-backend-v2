const mongoose = require('mongoose');

const failedEmailSchema = new mongoose.Schema({
  to: { type: String, required: true },
  subject: { type: String, required: true },
  html: { type: String, required: true },
  retries: { type: Number, default: 0 },
  lastError: { type: String },
  resolved: { type: Boolean, default: false },
}, { timestamps: true });

failedEmailSchema.index({ resolved: 1, retries: 1 });

module.exports = mongoose.model('FailedEmail', failedEmailSchema);
