const mongoose = require('mongoose');

const subscriptionAuditLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  programId: { type: String, required: true },
  mpSubscriptionId: { type: String, default: null },
  previousStatus: { type: String, default: null },
  newStatus: { type: String, required: true },
  priceARS: { type: Number, default: null },
  trigger: {
    type: String,
    enum: ['user', 'webhook', 'reconciliation', 'system', 'public_cancel'],
    required: true,
  },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

subscriptionAuditLogSchema.index({ userId: 1, programId: 1, createdAt: -1 });
subscriptionAuditLogSchema.index({ mpSubscriptionId: 1 });

module.exports = mongoose.model('SubscriptionAuditLog', subscriptionAuditLogSchema);
